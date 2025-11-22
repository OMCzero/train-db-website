import type { Env } from "./types";
import { getTrainCars } from "./api/train-cars";
import { getHTML, getCSS, getJS } from "./frontend/loader";

// Helper function to add security headers to responses
function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API endpoint to get train cars data
    if (url.pathname === "/api/train-cars") {
      // Validate that the request comes from our own domain
      const origin = request.headers.get("Origin");
      const referer = request.headers.get("Referer");
      const host = request.headers.get("Host") || url.host;

      // If Origin or Referer is present, it must be from our domain
      // Only allow HTTP origin in development environment for local testing
      const isDevelopment = host === "localhost" || host.startsWith("localhost:") || 
                            host === "127.0.0.1" || host.startsWith("127.0.0.1:") ||
                            host === "::1" || host.startsWith("[::1]:");
      const hasInvalidOrigin = origin && (
        isDevelopment
          ? (origin !== `https://${host}` && origin !== `http://${host}`)
          : (origin !== `https://${host}`)
      );
      const hasInvalidReferer = referer && (
        isDevelopment
          ? (!referer.startsWith(`https://${host}/`) && !referer.startsWith(`http://${host}/`))
          : (!referer.startsWith(`https://${host}/`))
      );

      if (hasInvalidOrigin || hasInvalidReferer) {
        const response = Response.json(
          { error: "Unauthorized: API can only be called from this website." },
          { status: 403 }
        );
        return addSecurityHeaders(response);
      }

      const response = await getTrainCars(env, ctx, url.searchParams);
      return addSecurityHeaders(response);
    }

    // Serve CSS file for development (in production it will be inlined)
    if (url.pathname === "/styles.css") {
      const response = new Response(getCSS(), {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
        },
      });
      return addSecurityHeaders(response);
    }

    // Serve JS file for development (in production it will be inlined)
    if (url.pathname === "/app.js") {
      const response = new Response(getJS(), {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
        },
      });
      return addSecurityHeaders(response);
    }

    // Serve the HTML frontend for all other routes
    const response = new Response(getHTML(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
    return addSecurityHeaders(response);
  },
};
