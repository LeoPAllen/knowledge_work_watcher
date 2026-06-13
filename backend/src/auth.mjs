import { timingSafeEqual } from "node:crypto";

function equalSecret(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createStudyTokenAuth(studyToken) {
  return async function requireStudyToken(request, reply) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";

    if (!token || !equalSecret(token, studyToken)) {
      return reply.code(401).send({
        request_id: request.id,
        error: "unauthorized",
      });
    }
  };
}
