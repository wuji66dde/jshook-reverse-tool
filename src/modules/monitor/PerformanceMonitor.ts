/**
 * PerformanceMonitor - 性能监控器（薄封装CDP Profiler域）
 * 
 * 核心功能：
 * 1. 性能指标收集（FCP, LCP, FID, CLS等）
 * 2. 代码覆盖率分析（Profiler.startPreciseCoverage）
 * 3. 内存快照（HeapProfiler）
 * 4. CPU性能分析（Profiler.start）
 * 5. 运行时性能指标（Performance API）
 * 
 * 设计原则：
 * - 薄封装CDP Profiler/HeapProfiler/Performance域
 * - 依赖CodeCollector获取Page实例
 * - 动态、AI友好的性能分析
 */

import type { CDPSession } from 'puppeteer';
import type { CodeCollector } from '../collector/CodeCollector.js';
import { logger } from '../../utils/logger.js';

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  // Web Vitals
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  ttfb?: number; // Time to First Byte
  
  // 基础指标
  domContentLoaded?: number;
  loadComplete?: number;
  
  // 资源指标
  scriptDuration?: number;
  layoutDuration?: number;
  recalcStyleDuration?: number;
  
  // 内存指标
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

/**
 * 代码覆盖率信息
 */
export interface CoverageInfo {
  url: string;
  ranges: Array<{
    start: number;
    end: number;
    count: number; // 执行次数
  }>;
  text?: string; // 源代码
  totalBytes: number;
  usedBytes: number;
  coveragePercentage: number;
}

/**
 * CPU性能分析结果（直接使用CDP的Profile类型）
 */
export interface CPUProfile {
  nodes: Array<{
    id: number;
    callFrame: {
      functionName: string;
      url: string;
      lineNumber: number;
      columnNumber: number;
    };
    hitCount?: number; // CDP返回的可能是undefined
    children?: number[];
  }>;
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private cdpSession: CDPSession | null = null;
  private coverageEnabled = false;
  private profilerEnabled = false;

  constructor(private collector: CodeCollector) {}

  /**
   * 初始化CDP会话
   */
  private async ensureCDPSession(): Promise<CDPSession> {
    if (!this.cdpSession) {
      const page = await this.collector.getActivePage();
      this.cdpSession = await page.createCDPSession();
    }
    return this.cdpSession;
  }

  // ==================== 性能指标收集 ====================

  /**
   * 获取性能指标（Web Vitals + 基础指标）
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const page = await this.collector.getActivePage();

    // 使用Performance API获取指标
    const metrics = await page.evaluate(() => {
      const result: any = {};

      // 1. Navigation Timing
      const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navTiming) {
        result.domContentLoaded = navTiming.domContentLoadedEventEnd - navTiming.fetchStart;
        result.loadComplete = navTiming.loadEventEnd - navTiming.fetchStart;
        result.ttfb = navTiming.responseStart - navTiming.requestStart;
      }

      // 2. Paint Timing (FCP)
      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
      if (fcpEntry) {
        result.fcp = fcpEntry.startTime;
      }

      // 3. LCP (Largest Contentful Paint)
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) {
        const lastLCP = lcpEntries[lcpEntries.length - 1] as any;
        result.lcp = lastLCP.renderTime || lastLCP.loadTime;
      }

      // 4. CLS (Cumulative Layout Shift)
      let clsValue = 0;
      const layoutShiftEntries = performance.getEntriesByType('layout-shift') as any[];
      for (const entry of layoutShiftEntries) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      result.cls = clsValue;

      // 5. Memory (如果可用)
      if ((performance as any).memory) {
        const memory = (performance as any).memory;
        result.jsHeapSizeLimit = memory.jsHeapSizeLimit;
        result.totalJSHeapSize = memory.totalJSHeapSize;
        result.usedJSHeapSize = memory.usedJSHeapSize;
      }

      return result;
    });

    logger.info('Performance metrics collected', {
      fcp: metrics.fcp,
      lcp: metrics.lcp,
      cls: metrics.cls,
    });

    return metrics;
  }

  /**
   * 获取详细的性能时间线
   */
  async getPerformanceTimeline(): Promise<any[]> {
    const page = await this.collector.getActivePage();

    const timeline = await page.evaluate(() => {
      return performance.getEntries().map(entry => ({
        name: entry.name,
        entryType: entry.entryType,
        startTime: entry.startTime,
        duration: entry.duration,
      }));
    });

    logger.info(`Performance timeline collected: ${timeline.length} entries`);
    return timeline;
  }

  // ==================== 代码覆盖率分析 ====================

  /**
   * 启用代码覆盖率收集
   */
  async startCoverage(options?: {
    resetOnNavigation?: boolean;
    reportAnonymousScripts?: boolean;
  }): Promise<void> {
    const cdp = await this.ensureCDPSession();

    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.startPreciseCoverage', {
      callCount: true,
      detailed: true,
      allowTriggeredUpdates: false,
      ...options,
    });

    this.coverageEnabled = true;
    logger.info('Code coverage collection started');
  }

  /**
   * 停止并获取代码覆盖率
   */
  async stopCoverage(): Promise<CoverageInfo[]> {
    if (!this.coverageEnabled) {
      throw new Error('Coverage not enabled. Call startCoverage() first.');
    }

    const cdp = await this.ensureCDPSession();

    const { result } = await cdp.send('Profiler.takePreciseCoverage');
    await cdp.send('Profiler.stopPreciseCoverage');
    await cdp.send('Profiler.disable');

    this.coverageEnabled = false;

    // 处理覆盖率数据
    const coverageInfo: CoverageInfo[] = result.map((entry: any) => {
      const totalBytes = entry.functions.reduce((sum: number, func: any) => {
        return sum + func.ranges.reduce((rangeSum: number, range: any) => {
          return rangeSum + (range.endOffset - range.startOffset);
        }, 0);
      }, 0);

      const usedBytes = entry.functions.reduce((sum: number, func: any) => {
        return sum + func.ranges.reduce((rangeSum: number, range: any) => {
          return range.count > 0 ? rangeSum + (range.endOffset - range.startOffset) : rangeSum;
        }, 0);
      }, 0);

      return {
        url: entry.url,
        ranges: entry.functions.flatMap((func: any) =>
          func.ranges.map((range: any) => ({
            start: range.startOffset,
            end: range.endOffset,
            count: range.count,
          }))
        ),
        totalBytes,
        usedBytes,
        coveragePercentage: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
      };
    });

    logger.success(`Code coverage collected: ${coverageInfo.length} scripts`, {
      totalScripts: coverageInfo.length,
      avgCoverage: coverageInfo.reduce((sum, info) => sum + info.coveragePercentage, 0) / coverageInfo.length,
    });

    return coverageInfo;
  }

  // ==================== CPU性能分析 ====================

  /**
   * 启动CPU性能分析
   */
  async startCPUProfiling(): Promise<void> {
    const cdp = await this.ensureCDPSession();

    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');

    this.profilerEnabled = true;
    logger.info('CPU profiling started');
  }

  /**
   * 停止CPU性能分析并获取结果
   */
  async stopCPUProfiling(): Promise<CPUProfile> {
    if (!this.profilerEnabled) {
      throw new Error('CPU profiling not enabled. Call startCPUProfiling() first.');
    }

    const cdp = await this.ensureCDPSession();

    const { profile } = await cdp.send('Profiler.stop');
    await cdp.send('Profiler.disable');

    this.profilerEnabled = false;

    logger.success('CPU profiling stopped', {
      nodes: profile.nodes.length,
      samples: profile.samples?.length || 0,
    });

    return profile;
  }

  // ==================== 内存分析 ====================

  /**
   * 获取堆快照（内存分析）
   */
  async takeHeapSnapshot(): Promise<string> {
    const cdp = await this.ensureCDPSession();

    await cdp.send('HeapProfiler.enable');

    let snapshotData = '';

    // 监听快照数据块
    cdp.on('HeapProfiler.addHeapSnapshotChunk', (params: any) => {
      snapshotData += params.chunk;
    });

    await cdp.send('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false,
      treatGlobalObjectsAsRoots: true,
    });

    await cdp.send('HeapProfiler.disable');

    logger.success('Heap snapshot taken', {
      size: snapshotData.length,
    });

    return snapshotData;
  }

  /**
   * 关闭监控
   */
  async close(): Promise<void> {
    if (this.cdpSession) {
      if (this.coverageEnabled) {
        await this.stopCoverage();
      }
      if (this.profilerEnabled) {
        await this.stopCPUProfiling();
      }
      await this.cdpSession.detach();
      this.cdpSession = null;
    }
    logger.info('PerformanceMonitor closed');
  }
}

