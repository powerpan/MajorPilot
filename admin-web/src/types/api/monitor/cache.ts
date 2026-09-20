/** 定时任务信息 */
export interface SysCache {
  /** 缓存名称 */
  cacheName?: string;
  /** 缓存键名 */
  cacheKey?: string;
  /** 缓存内容 */
  cacheValue?: string;
  /** 备注 */
  remark?: string;
}

/** Redis INFO values are strings; command counts are serialized as strings by RuoYi. */
export interface CacheOverview {
  info: Record<string, string>;
  dbSize: number;
  commandStats: Array<{ name: string; value: string }>;
}
