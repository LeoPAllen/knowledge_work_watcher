import test from "node:test";
import assert from "node:assert/strict";

import {
  URL_CLASSIFICATIONS,
  classifyUrl,
} from "../src/shared/privacy-filter.mjs";
import {
  DEFAULT_ALLOWLIST,
  DEFAULT_DENYLIST,
} from "../src/config/domain-policy.mjs";

test("exposes the complete classification set", () => {
  assert.deepEqual(URL_CLASSIFICATIONS, [
    "allowed",
    "denied",
    "private_or_sensitive",
    "unsupported",
    "invalid",
  ]);
});

test("allows default search, LLM, Q&A, code, docs, and reference domains", () => {
  const examples = [
    ["https://www.google.com/search?q=synthetic", "search"],
    ["https://chatgpt.com/", "llm"],
    ["https://stackoverflow.com/questions/1/example", "qa"],
    ["https://github.com/example/project", "code_and_packages"],
    ["https://developer.mozilla.org/en-US/docs/Web/API/URL", "documentation"],
    ["https://en.wikipedia.org/wiki/Knowledge_worker", "reference"],
  ];

  for (const [url, category] of examples) {
    assert.deepEqual(classifyUrl(url), {
      classification: "allowed",
      reason: "default_allowlist",
      category,
    });
  }
});

test("classifies every configured default allowlist domain as allowed", () => {
  for (const [category, domains] of Object.entries(DEFAULT_ALLOWLIST)) {
    for (const domain of domains) {
      assert.deepEqual(classifyUrl(`https://${domain}/`), {
        classification: "allowed",
        reason: "default_allowlist",
        category,
      });
    }
  }
});

test("classifies every configured default denylist domain as denied", () => {
  for (const [category, domains] of Object.entries(DEFAULT_DENYLIST)) {
    for (const domain of domains) {
      assert.deepEqual(classifyUrl(`https://${domain}/`), {
        classification: "denied",
        reason: "denied_domain",
        category,
      });
    }
  }
});

test("allows legitimate subdomains but rejects lookalike domains", () => {
  assert.equal(
    classifyUrl("https://gist.github.com/example/1").classification,
    "allowed",
  );
  assert.deepEqual(classifyUrl("https://github.com.evil.example/"), {
    classification: "unsupported",
    reason: "not_allowlisted",
    category: null,
  });
});

test("allows configured custom domains without treating values as URL patterns", () => {
  assert.deepEqual(
    classifyUrl("https://docs.example.edu/guide", {
      customAllowlist: ["example.edu"],
    }),
    {
      classification: "allowed",
      reason: "custom_allowlist",
      category: "custom",
    },
  );

  assert.equal(
    classifyUrl("https://example.edu/", {
      customAllowlist: ["https://example.edu/path"],
    }).classification,
    "unsupported",
  );
});

test("unknown HTTP and HTTPS domains fail closed as unsupported", () => {
  assert.deepEqual(classifyUrl("https://public.example/"), {
    classification: "unsupported",
    reason: "not_allowlisted",
    category: null,
  });
});

test("denylisted domains override default and custom allowlists", () => {
  const webmail = classifyUrl("https://mail.google.com/mail/u/0/");
  assert.deepEqual(webmail, {
    classification: "denied",
    reason: "denied_domain",
    category: "webmail",
  });

  const banking = classifyUrl("https://secure.chase.com/", {
    customAllowlist: ["chase.com"],
  });
  assert.deepEqual(banking, {
    classification: "denied",
    reason: "denied_domain",
    category: "finance_accounts",
  });

  const privateDocs = classifyUrl("https://docs.google.com/document/d/example", {
    customAllowlist: ["docs.google.com"],
  });
  assert.equal(privateDocs.classification, "denied");
  assert.equal(privateDocs.category, "private_docs_and_storage");
});

test("blocks health, adult, payment, webmail, and private storage categories", () => {
  const examples = [
    ["https://patient.mychart.com/", "health_and_medical"],
    ["https://www.pornhub.com/", "adult"],
    ["https://www.paypal.com/myaccount/", "finance_accounts"],
    ["https://mail.proton.me/u/0/inbox", "webmail"],
    ["https://www.dropbox.com/home", "private_docs_and_storage"],
  ];

  for (const [url, category] of examples) {
    const classification = classifyUrl(url);
    assert.equal(classification.classification, "denied");
    assert.equal(classification.category, category);
  }
});

test("sensitive account paths and subdomains override allowed domains", () => {
  assert.deepEqual(classifyUrl("https://github.com/login"), {
    classification: "private_or_sensitive",
    reason: "sensitive_path",
    category: null,
  });
  assert.deepEqual(classifyUrl("https://accounts.google.com/"), {
    classification: "private_or_sensitive",
    reason: "sensitive_subdomain",
    category: null,
  });
  assert.equal(
    classifyUrl("https://github.com/account", {
      customAllowlist: ["github.com"],
    }).classification,
    "private_or_sensitive",
  );
});

test("blocks localhost and private IPv4 by default", () => {
  const urls = [
    "http://localhost:3000/",
    "http://service.local/",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/",
    "http://0177.0.0.1/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.1.1/",
  ];

  for (const url of urls) {
    assert.equal(classifyUrl(url).classification, "private_or_sensitive");
  }
});

test("classifies common intranet suffixes as private", () => {
  const urls = [
    "https://portal.internal/",
    "https://service.corp/",
    "https://router.lan/",
    "https://device.home.arpa/",
  ];

  for (const url of urls) {
    assert.deepEqual(classifyUrl(url), {
      classification: "private_or_sensitive",
      reason: "local_hostname",
      category: null,
    });
  }
});

test("blocks loopback and private IPv6 by default", () => {
  const urls = [
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fd12:3456::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
  ];

  for (const url of urls) {
    assert.equal(classifyUrl(url).classification, "private_or_sensitive");
  }

  assert.equal(
    classifyUrl("https://[2001:db8::1]/").classification,
    "unsupported",
  );
});

test("private network access requires both debug flags and still blocks login paths", () => {
  const url = "http://localhost:3000/";

  assert.equal(
    classifyUrl(url, { debugMode: true }).classification,
    "private_or_sensitive",
  );
  assert.equal(
    classifyUrl(url, { allowPrivateInDebug: true }).classification,
    "private_or_sensitive",
  );
  assert.deepEqual(
    classifyUrl(url, { debugMode: true, allowPrivateInDebug: true }),
    {
      classification: "allowed",
      reason: "debug_private_network",
      category: "debug",
    },
  );
  assert.equal(
    classifyUrl("http://localhost:3000/login", {
      debugMode: true,
      allowPrivateInDebug: true,
    }).classification,
    "private_or_sensitive",
  );
});

test("classifies local files, browser internals, and extension pages as private", () => {
  const urls = [
    "file:///Users/example/private.txt",
    "chrome://settings/",
    "about:blank",
    "chrome-extension://abcdefghijklmnop/options.html",
    "edge-extension://abcdefghijklmnop/options.html",
    "moz-extension://example/options.html",
    "view-source:https://github.com/example/project",
  ];

  for (const url of urls) {
    assert.deepEqual(classifyUrl(url), {
      classification: "private_or_sensitive",
      reason: "private_scheme",
      category: null,
    });
  }
});

test("classifies unsupported schemes separately from invalid input", () => {
  const unsupported = [
    "ftp://example.com/file",
    "data:text/plain,example",
    "mailto:person@example.com",
    "blob:https://example.com/id",
  ];

  for (const url of unsupported) {
    assert.equal(classifyUrl(url).classification, "unsupported");
  }

  for (const value of ["", "not a url", null, undefined]) {
    assert.equal(classifyUrl(value).classification, "invalid");
  }
});

test("blocks embedded credentials before allowlist matching", () => {
  assert.deepEqual(classifyUrl("https://user:secret@github.com/example/repo"), {
    classification: "private_or_sensitive",
    reason: "embedded_credentials",
    category: null,
  });
});

test("normalizes hostname case, trailing dots, and ports", () => {
  assert.equal(
    classifyUrl("HTTPS://GITHUB.COM.:443/example/repo").classification,
    "allowed",
  );
  assert.equal(
    classifyUrl("https://WWW.DUCKDUCKGO.COM:443/?q=test").classification,
    "allowed",
  );
});
