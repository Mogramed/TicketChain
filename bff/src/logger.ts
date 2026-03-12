import { randomUUID } from "node:crypto";

import pino from "pino";
import type { NextFunction, Request, Response } from "express";

import { config } from "./config.js";
import { metrics } from "./metrics.js";

export const logger = pino({
  level: config.nodeEnv === "development" ? "debug" : "info",
  base: {
    service: "chainticket-bff",
    env: config.nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function requestLogger(request: Request, response: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const headerRequestId = request.header("x-request-id");
  const requestId = headerRequestId && headerRequestId.length > 0 ? headerRequestId : randomUUID();
  response.setHeader("x-request-id", requestId);

  response.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const routePath =
      typeof request.route?.path === "string"
        ? `${request.baseUrl ?? ""}${request.route.path}`
        : request.path;

    metrics.recordHttpRequest({
      method: request.method,
      path: routePath,
      statusCode: response.statusCode,
      durationMs,
    });

    logger.info(
      {
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs,
        userAgent: request.header("user-agent") ?? "",
      },
      "HTTP request",
    );
  });

  next();
}
