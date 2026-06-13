import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { SCHEMA_VERSION } from "../../extension/src/shared/event-schema.mjs";
import { createStudyTokenAuth } from "./auth.mjs";
import { EventStorage } from "./storage.mjs";
import {
  validateBatchEnvelope,
  validateIngestEvent,
} from "./validation.mjs";

function errorBody(request, error, details) {
  return {
    request_id: request.id,
    error,
    ...(details ? { details } : {}),
  };
}

export function buildApp({
  config,
  storage = new EventStorage(config.storagePath),
  now = () => new Date().toISOString(),
  logger = false,
}) {
  const app = Fastify({
    logger,
    bodyLimit: config.maxPayloadBytes,
    genReqId: randomUUID,
  });
  const requireStudyToken = createStudyTokenAuth(config.studyToken);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (
      config.corsAllowedOrigin &&
      request.headers.origin === config.corsAllowedOrigin
    ) {
      reply.header("access-control-allow-origin", config.corsAllowedOrigin);
      reply.header("vary", "Origin");
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send(errorBody(request, "payload_too_large"));
    }
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return reply
        .code(error.statusCode)
        .send(errorBody(request, "invalid_request"));
    }
    request.log.error(
      { requestId: request.id, errorCode: error.code ?? "internal_error" },
      "request failed",
    );
    return reply.code(500).send(errorBody(request, "internal_error"));
  });

  app.get("/health", async (request) => ({
    request_id: request.id,
    status: "ok",
  }));

  app.get("/v1/schema/version", async (request) => ({
    request_id: request.id,
    schema_version: SCHEMA_VERSION,
  }));

  app.options("/v1/*", async (request, reply) => {
    if (
      !config.corsAllowedOrigin ||
      request.headers.origin !== config.corsAllowedOrigin
    ) {
      return reply.code(403).send(errorBody(request, "origin_not_allowed"));
    }
    return reply
      .header("access-control-allow-methods", "GET, POST, OPTIONS")
      .header("access-control-allow-headers", "Authorization, Content-Type")
      .code(204)
      .send();
  });

  app.post(
    "/v1/events",
    { preHandler: requireStudyToken },
    async (request, reply) => {
      const validation = validateIngestEvent(request.body);
      if (!validation.valid) {
        return reply
          .code(400)
          .send(errorBody(request, "invalid_event", validation.errors));
      }

      const stored = storage.append(validation.event, {
        receivedAt: now(),
        requestId: request.id,
      });
      if (!stored.accepted) {
        return reply.code(409).send(errorBody(request, stored.reason));
      }
      return reply.code(202).send({
        request_id: request.id,
        accepted: true,
        event_id: validation.event.event_id,
      });
    },
  );

  app.post(
    "/v1/events/batch",
    { preHandler: requireStudyToken },
    async (request, reply) => {
      const envelope = validateBatchEnvelope(request.body);
      if (!envelope.valid) {
        return reply
          .code(400)
          .send(errorBody(request, "invalid_batch", envelope.errors));
      }

      const results = envelope.events.map((input, index) => {
        const validation = validateIngestEvent(input);
        if (!validation.valid) {
          return {
            index,
            accepted: false,
            reason: "invalid_event",
            details: validation.errors,
          };
        }
        const stored = storage.append(validation.event, {
          receivedAt: now(),
          requestId: request.id,
        });
        return stored.accepted
          ? { index, accepted: true, event_id: validation.event.event_id }
          : { index, accepted: false, reason: stored.reason };
      });

      return reply.code(202).send({
        request_id: request.id,
        accepted: results.filter((result) => result.accepted).length,
        rejected: results.filter((result) => !result.accepted).length,
        results,
      });
    },
  );

  app.addHook("onClose", async () => {
    storage.close();
  });

  return app;
}
