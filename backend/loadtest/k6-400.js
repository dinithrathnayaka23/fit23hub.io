import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const EMAIL = __ENV.LOADTEST_EMAIL || "";
const PASSWORD = __ENV.LOADTEST_PASSWORD || "";

export const options = {
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1200", "p(99)<2500"],
  },
  scenarios: {
    ramp_to_400: {
      executor: "ramping-vus",
      startVUs: 20,
      stages: [
        { duration: "2m", target: 120 },
        { duration: "3m", target: 250 },
        { duration: "4m", target: 400 },
        { duration: "3m", target: 400 },
        { duration: "2m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
};

export function setup() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Set LOADTEST_EMAIL and LOADTEST_PASSWORD environment variables.");
  }

  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: EMAIL,
    password: PASSWORD,
  }), {
    headers: { "Content-Type": "application/json" },
  });

  check(loginRes, {
    "login status is 200": (res) => res.status === 200,
    "token exists": (res) => Boolean(res.json("token")),
  });

  return { token: loginRes.json("token") };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    "Content-Type": "application/json",
  };

  const requests = [
    ["GET", `${BASE_URL}/api/materials?page=1&pageSize=24`, null],
    ["GET", `${BASE_URL}/api/live?page=1&pageSize=24`, null],
    ["GET", `${BASE_URL}/api/recordings?page=1&pageSize=24`, null],
    ["GET", `${BASE_URL}/api/overview`, null],
  ];

  const responses = http.batch(
    requests.map(([method, url, body]) => ({
      method,
      url,
      body,
      params: { headers },
    })),
  );

  check(responses[0], { "materials 200": (res) => res.status === 200 });
  check(responses[1], { "live 200": (res) => res.status === 200 });
  check(responses[2], { "recordings 200": (res) => res.status === 200 });
  check(responses[3], { "overview 200": (res) => res.status === 200 });

  sleep(1);
}
