// SSE (Server-Sent Events) endpoint for real-time subscriptions
//
// Clients connect to this endpoint to receive real-time updates
// about changes in the system (observations, artifacts, etc.)

import { getAuthFromRequest } from '@/src/lib/auth/dev-auth';
import { eventBus } from '@/src/lib/events/bus';
import type { SystemEvent } from '@/src/lib/events/types';

/**
 * SSE endpoint for real-time event subscriptions.
 *
 * Usage:
 * ```javascript
 * const eventSource = new EventSource('/api/events?nodeId=my-node');
 * eventSource.onmessage = (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log('Event:', data);
 * };
 * ```
 */
export async function GET(req: Request): Promise<Response> {
  // Check authentication
  const authResult = getAuthFromRequest(req);
  if (!authResult.success) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get nodeId from query params (defaults to authenticated user's node)
  const url = new URL(req.url);
  const nodeId = url.searchParams.get('nodeId') ?? authResult.auth.nodeId;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ nodeId })}\n\n`)
      );

      // Subscribe to events for this node
      const unsubscribe = eventBus.subscribe(nodeId, (event: SystemEvent) => {
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
        } catch (error) {
          console.error('Error sending SSE event:', error);
        }
      });

      // Set up heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Connection closed, clean up
          clearInterval(heartbeatInterval);
          unsubscribe();
        }
      }, 30000); // Every 30 seconds

      // Clean up on abort
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in nginx
    },
  });
}
