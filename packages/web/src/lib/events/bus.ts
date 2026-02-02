// In-memory event pub/sub for real-time notifications
//
// This provides a simple pub/sub mechanism for broadcasting events
// to connected clients. In production, this would be replaced with
// Redis Pub/Sub or similar for multi-instance support.

import type { SystemEvent, EventHandler } from './types';

type Subscription = {
  nodeId: string;
  handler: EventHandler;
};

/**
 * In-memory event bus for pub/sub.
 *
 * Subscribers receive events for nodes they're subscribed to.
 * This is a simple implementation suitable for single-server deployments.
 *
 * For multi-server deployments (e.g., Vercel), replace with Redis Pub/Sub:
 * - Publish events to Redis channel
 * - Each server subscribes to Redis and forwards to local SSE connections
 */
class EventBus {
  private subscriptions: Map<string, Set<Subscription>> = new Map();
  private nextId = 0;

  /**
   * Subscribe to events for a specific node.
   *
   * @param nodeId The node to receive events for
   * @param handler Callback invoked when events occur
   * @returns Unsubscribe function
   */
  subscribe(nodeId: string, handler: EventHandler): () => void {
    const subscription: Subscription = { nodeId, handler };

    if (!this.subscriptions.has(nodeId)) {
      this.subscriptions.set(nodeId, new Set());
    }

    this.subscriptions.get(nodeId)!.add(subscription);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(nodeId);
      if (subs) {
        subs.delete(subscription);
        if (subs.size === 0) {
          this.subscriptions.delete(nodeId);
        }
      }
    };
  }

  /**
   * Publish an event to all subscribers for the event's node.
   *
   * @param event The event to publish
   */
  async publish(event: SystemEvent): Promise<void> {
    const subs = this.subscriptions.get(event.nodeId);
    if (!subs || subs.size === 0) {
      return;
    }

    // Fan out to all subscribers
    const promises: Promise<void>[] = [];
    for (const sub of subs) {
      try {
        const result = sub.handler(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        // Log but don't fail other handlers
        console.error('Event handler error:', error);
      }
    }

    // Wait for all async handlers
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Generate a unique event ID.
   */
  generateEventId(): string {
    return `evt_${Date.now()}_${++this.nextId}`;
  }

  /**
   * Get the number of subscribers for a node.
   * Useful for debugging and monitoring.
   */
  subscriberCount(nodeId: string): number {
    return this.subscriptions.get(nodeId)?.size ?? 0;
  }

  /**
   * Get total number of subscriptions across all nodes.
   */
  totalSubscriptions(): number {
    let total = 0;
    for (const subs of this.subscriptions.values()) {
      total += subs.size;
    }
    return total;
  }
}

/**
 * Global event bus singleton.
 *
 * In serverless environments, this persists across warm invocations
 * but is reset on cold starts. For durable pub/sub, use Redis.
 */
export const eventBus = new EventBus();

/**
 * Create a new event with the current timestamp and generated ID.
 */
export function createEvent<T extends SystemEvent['type']>(
  type: T,
  nodeId: string,
  payload: Extract<SystemEvent, { type: T }>['payload']
): Extract<SystemEvent, { type: T }> {
  return {
    id: eventBus.generateEventId(),
    type,
    timestamp: new Date().toISOString(),
    nodeId,
    payload,
  } as Extract<SystemEvent, { type: T }>;
}

export type { EventBus };
