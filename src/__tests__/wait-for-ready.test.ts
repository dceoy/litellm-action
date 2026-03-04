import * as http from 'http';

jest.mock('@actions/core');
jest.mock('http');

const core = jest.requireMock('@actions/core') as {
  info: jest.Mock;
  debug: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const httpGet = http.get as any as jest.Mock;

import { waitForReady } from '../wait-for-ready';

interface MockRequest {
  on: jest.Mock;
  setTimeout: jest.Mock;
  destroy: jest.Mock;
}

function mockHttpSuccess(statusCode = 200): void {
  httpGet.mockImplementationOnce(
    (_url: string, cb: (res: http.IncomingMessage) => void) => {
      const res = {
        statusCode,
        resume: jest.fn(),
      } as unknown as http.IncomingMessage;
      cb(res);
      const req: MockRequest = {
        on: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
      };
      return req;
    },
  );
}

function mockHttpError(): void {
  httpGet.mockImplementationOnce(() => {
    const req: MockRequest = {
      on: jest.fn((event: string, handler: (err: Error) => void) => {
        if (event === 'error') {
          handler(new Error('ECONNREFUSED'));
        }
        return req;
      }),
      setTimeout: jest.fn().mockReturnThis(),
      destroy: jest.fn(),
    };
    return req;
  });
}

function mockHttpTimeout(): void {
  httpGet.mockImplementationOnce(() => {
    const req: MockRequest = {
      on: jest.fn().mockReturnThis(),
      setTimeout: jest.fn((_ms: number, cb?: () => void) => {
        if (cb) cb();
        return req;
      }),
      destroy: jest.fn(),
    };
    return req;
  });
}

describe('waitForReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return immediately when health check returns 200', async () => {
    mockHttpSuccess(200);

    await waitForReady('http://localhost:4000', 10);

    expect(core.info).toHaveBeenCalledWith(
      'Polling http://localhost:4000/health/readiness (timeout: 10s)...',
    );
  });

  it('should retry when health check returns non-200 then succeed', async () => {
    mockHttpSuccess(500);
    mockHttpSuccess(200);

    const promise = waitForReady('http://localhost:4000', 30);
    await jest.advanceTimersByTimeAsync(2000);
    await promise;

    expect(core.debug).toHaveBeenCalledWith(
      'Health check returned non-200 status, retrying...',
    );
  });

  it('should retry when health check connection fails then succeed', async () => {
    mockHttpError();
    mockHttpSuccess(200);

    const promise = waitForReady('http://localhost:4000', 30);
    await jest.advanceTimersByTimeAsync(2000);
    await promise;

    expect(core.debug).toHaveBeenCalledWith(
      'Health check connection failed, retrying...',
    );
  });

  it('should throw when timeout is reached', async () => {
    httpGet.mockImplementation(() => {
      const req: MockRequest = {
        on: jest.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            handler(new Error('ECONNREFUSED'));
          }
          return req;
        }),
        setTimeout: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
      };
      return req;
    });

    const promise = waitForReady('http://localhost:4000', 2);
    const rejection = expect(promise).rejects.toThrow(
      'LiteLLM proxy did not become ready within 2 seconds',
    );
    await jest.advanceTimersByTimeAsync(4000);
    await rejection;
  });

  it('should handle request timeout in checkHealth', async () => {
    mockHttpTimeout();
    mockHttpSuccess(200);

    const promise = waitForReady('http://localhost:4000', 30);
    await jest.advanceTimersByTimeAsync(2000);
    await promise;

    expect(core.debug).toHaveBeenCalledWith(
      'Health check connection failed, retrying...',
    );
  });
});
