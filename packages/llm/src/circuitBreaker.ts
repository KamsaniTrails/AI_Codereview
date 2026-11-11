import { logger } from '@ai-reviewer/core';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // default 5 consecutive failures
  cooldownPeriodMs?: number; // default 30 seconds
}

export class CircuitBreaker {
  private failureCount = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private nextAttemptTime = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(options?: CircuitBreakerOptions) {
    this.threshold = options?.failureThreshold || 5;
    this.cooldownMs = options?.cooldownPeriodMs || 30000;
  }

  public canExecute(): boolean {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (now >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  public recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  public recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.threshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.cooldownMs;
      logger.warn(
        { failureCount: this.failureCount, cooldownMs: this.cooldownMs },
        'LLM Circuit breaker tripped to OPEN state. Backing off calls.'
      );
    }
  }

  public getState() {
    return this.state;
  }
}

