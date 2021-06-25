import { Async } from './Async';
import type { ICancelable } from './Async';

describe.only('Async', () => {
  describe('debounce', () => {
    // Increase count by a specific number, to test the arguments
    // of the debounced function;
    let callCount = 0;
    const fn = jest.fn((increaseCount: number) => {
      callCount += increaseCount;
      return callCount;
    });

    let async: Async;
    let debouncedFn: ICancelable<typeof fn> & typeof fn;

    beforeEach(() => {
      jest.useFakeTimers();

      async = new Async();
      debouncedFn = async.debounce(fn, 100);
    });

    afterEach(() => {
      callCount = 0;
      fn.mockClear();
    });

    it('should debounce multiple calls', () => {
      // Mock Date.now to return each call
      // First one is the first debouncedFn(1)
      // Second one is debouncedFn(2)
      // A last one will be when the timer fires after we run pending timers in jest.
      const dateMock = jest
        .spyOn(Date, 'now')
        .mockImplementationOnce(() => 10)
        .mockImplementationOnce(() => 11)
        .mockImplementation(() => 2000);

      debouncedFn(1);
      expect(debouncedFn.pending()).toBeTruthy();
      debouncedFn(2);
      expect(debouncedFn.pending()).toBeTruthy();

      jest.runOnlyPendingTimers();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(callCount).toEqual(2);

      dateMock.mockRestore();
    });

    it('should flush the last value', () => {
      debouncedFn(10);
      debouncedFn(20);
      expect(debouncedFn.pending()).toBeTruthy();
      expect(debouncedFn.flush()).toEqual(20);
    });

    it('should be marked pending as expected', () => {
      debouncedFn(100);
      expect(debouncedFn.pending()).toBeTruthy();
      debouncedFn(200);
      expect(debouncedFn.pending()).toBeTruthy();

      debouncedFn.flush();
      expect(debouncedFn.pending()).toBeFalsy();
    });

    it('should be cancellable', () => {
      debouncedFn(1000);
      debouncedFn.cancel();
      expect(debouncedFn.pending()).toBeFalsy();
      expect(debouncedFn.flush()).toBeUndefined();
    });
  });

  describe('throttle', () => {
    it('should throttle multiple calls', () => {
      jest.useFakeTimers();

      // Mock Date.now to return each call
      // First one is the first throttledFn(1)
      // Second one is throttledFn(2)
      // A last one will be when the timer fires after we run pending timers in jest.
      const dateMock = jest
        .spyOn(Date, 'now')
        .mockImplementationOnce(() => 10)
        .mockImplementationOnce(() => 11)
        .mockImplementation(() => 2000);

      const fn = jest.fn((num: number) => num);
      const async = new Async();
      const throttledFn = async.throttle(fn, 1000);

      let result = throttledFn(1);
      expect(result).toBeUndefined();
      result = throttledFn(2);
      expect(result).toBeUndefined();

      jest.runOnlyPendingTimers();

      expect(fn).toHaveBeenCalledTimes(1);

      dateMock.mockRestore();
    });
  });

  describe('requestBatchedAnimationFrame', () => {
    let rAFSpy: jest.Mock;
    let cAFSpy: jest.Mock;

    let frameId = 1;
    let frameCallbacks: Map<number, Array<(time: number) => void>> = new Map();
    function mockRequestAnimationFrame(callback: (time: number) => void) {
      if (!frameCallbacks.has(frameId)) {
        frameCallbacks.set(frameId, []);
      }

      frameCallbacks.get(frameId)?.push(callback);
      return frameId;
    }

    function mockClearAnimationFrame(frameIdToClear: number) {
      frameCallbacks.delete(frameIdToClear);
    }

    function flushMockAnimationFrames() {
      let currentFrame = frameId;
      frameId += 1;

      if (!frameCallbacks.has(currentFrame)) {
        return;
      }

      const callbacks = frameCallbacks.get(currentFrame)!;
      for (let callback of callbacks) {
        callback(Date.now());
      }
    }

    beforeEach(() => {
      frameCallbacks = new Map();
      window.requestAnimationFrame = rAFSpy = jest.fn(mockRequestAnimationFrame);
      window.cancelAnimationFrame = cAFSpy = jest.fn(mockClearAnimationFrame);
    });

    it('should call the passed in callback', () => {
      const callback = jest.fn();

      const async = new Async();
      async.requestBatchedAnimationFrame(callback);

      expect(rAFSpy).toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();

      flushMockAnimationFrames();

      expect(callback).toHaveBeenCalled();
    });

    it('should unsubscribe the callback', () => {
      const callback = jest.fn();

      const async = new Async();
      const unsubscribe = async.requestBatchedAnimationFrame(callback);

      expect(rAFSpy).toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();

      unsubscribe();

      expect(cAFSpy).toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();

      flushMockAnimationFrames();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should unsubscribe on dispose', () => {
      const callback = jest.fn();

      const async = new Async();
      async.requestBatchedAnimationFrame(callback);

      expect(rAFSpy).toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();

      async.dispose();

      expect(cAFSpy).toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();

      flushMockAnimationFrames();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should batch multiple Async instances with multiple callback', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      const async1 = new Async();
      const async2 = new Async();

      expect(rAFSpy).not.toHaveBeenCalled();

      async1.requestBatchedAnimationFrame(callback1);
      async1.requestBatchedAnimationFrame(callback2);
      async2.requestBatchedAnimationFrame(callback3);

      flushMockAnimationFrames();

      expect(rAFSpy).toHaveBeenCalledTimes(1);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it('should still call callbacks if only one Async instance disposes', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      const async1 = new Async();
      const async2 = new Async();

      async1.requestBatchedAnimationFrame(callback1);
      async1.requestBatchedAnimationFrame(callback2);
      async2.requestBatchedAnimationFrame(callback3);

      expect(rAFSpy).toHaveBeenCalledTimes(1);

      async2.dispose();
      expect(cAFSpy).not.toHaveBeenCalled();

      flushMockAnimationFrames();

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).not.toHaveBeenCalled();
    });

    it('should call cancelAnimationFrame after all Async instances dispose', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      const async1 = new Async();
      const async2 = new Async();

      async1.requestBatchedAnimationFrame(callback1);
      async1.requestBatchedAnimationFrame(callback2);
      async2.requestBatchedAnimationFrame(callback3);

      expect(rAFSpy).toHaveBeenCalledTimes(1);

      async2.dispose();
      expect(cAFSpy).not.toHaveBeenCalled();

      async1.dispose();
      expect(cAFSpy).toHaveBeenCalledTimes(1);

      flushMockAnimationFrames();

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).not.toHaveBeenCalled();
    });

    it('should do nothing on an already disposed Async instance', () => {
      const callback = jest.fn();

      const async = new Async();
      async.dispose();

      async.requestBatchedAnimationFrame(callback);
      expect(rAFSpy).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should run nested batched animation frames on the next frame', () => {
      const async = new Async();

      // Should not run on the first flush
      const nestedCallback = jest.fn();
      const callback = jest.fn(() => async.requestBatchedAnimationFrame(nestedCallback));
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      async.requestBatchedAnimationFrame(callback);
      async.requestBatchedAnimationFrame(callback2);
      expect(rAFSpy).toHaveBeenCalledTimes(1);

      flushMockAnimationFrames();

      expect(rAFSpy).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(callback3).not.toHaveBeenCalled();
      expect(nestedCallback).not.toHaveBeenCalled();

      async.requestBatchedAnimationFrame(callback3);
      flushMockAnimationFrames();

      expect(rAFSpy).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
      expect(nestedCallback).toHaveBeenCalledTimes(1);
    });

    it('should call callbacks with correct context', () => {
      const expectedContext1 = {};
      const expectedContext2 = {};

      let actualContext1: object | null = null;
      let actualContext2: object | null = null;
      let actualContext3: object | null = null;

      const callback1 = jest.fn(function (this: object) {
        actualContext1 = this;
      });
      const callback2 = jest.fn(function (this: object) {
        actualContext2 = this;
      });
      const callback3 = jest.fn(function (this: object) {
        actualContext3 = this;
      });

      const async1 = new Async(expectedContext1);
      const async2 = new Async(expectedContext2);

      async1.requestBatchedAnimationFrame(callback1);
      async1.requestBatchedAnimationFrame(callback2);
      async2.requestBatchedAnimationFrame(callback3);
      flushMockAnimationFrames();

      expect(actualContext1).toBe(expectedContext1);
      expect(actualContext2).toBe(expectedContext1);
      expect(actualContext3).toBe(expectedContext2);
    });

    it('should do nothing if unsubscribe is called after the relevant rAF has executed', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      const async1 = new Async();
      const async2 = new Async();

      const unsubscribe = async1.requestBatchedAnimationFrame(callback1);
      flushMockAnimationFrames();

      expect(rAFSpy).toHaveBeenCalledTimes(1);
      expect(callback1).toHaveBeenCalledTimes(1);

      async1.requestBatchedAnimationFrame(callback2);
      async2.requestBatchedAnimationFrame(callback3);
      unsubscribe();

      expect(rAFSpy).toHaveBeenCalledTimes(2);
      expect(cAFSpy).not.toHaveBeenCalled();

      flushMockAnimationFrames();

      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if unsubscribe is called after the Async is disposed', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      const async1 = new Async();
      const async2 = new Async();

      async1.requestBatchedAnimationFrame(callback1);
      async1.requestBatchedAnimationFrame(callback2);
      const unsubscribe3 = async2.requestBatchedAnimationFrame(callback3);

      expect(rAFSpy).toHaveBeenCalledTimes(1);

      async2.dispose();
      expect(cAFSpy).not.toHaveBeenCalled();

      unsubscribe3();
      expect(cAFSpy).not.toHaveBeenCalled();

      flushMockAnimationFrames();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(callback3).not.toHaveBeenCalled();
    });
  });
});
