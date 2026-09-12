// modules/system/system_metrics.js
export async function execute(params, context) {
  const os = context.os;
  const sysConfig = context.config?.metrics || {};
  const viewConfig = context.config?.view || {};

  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
  const usedMemMb = totalMemMb - freeMemMb;
  const memUsagePercent = Math.round((usedMemMb / totalMemMb) * 100);

  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'Generic x86_64';
  const cpuCores = cpus.length;
  const loadAvg = os.loadavg();
  const cpuEstimatedPercent = Math.min(100, Math.round(loadAvg[0] * 15 + 12));
  const uptimeHours = (os.uptime() / 3600).toFixed(1);

  // Создаем стандартный View: MetricsView
  const metricsView = context.views.createMetricsView({
    cpuPercent: cpuEstimatedPercent,
    cpuModel: cpuModel,
    cpuCores: cpuCores,
    memUsedMb: usedMemMb,
    memTotalMb: totalMemMb,
    memPercent: memUsagePercent + '%',
    uptime: uptimeHours + ' ч.',
    loadAverage: [loadAvg[0].toFixed(2), loadAvg[1].toFixed(2), loadAvg[2].toFixed(2)],
    platform: `${os.platform()} (${os.release()})`
  }, {
    title: 'Метрики системы',
    pinned: viewConfig.default_pinned === 'true'
  });

  return {
    status: 'online',
    cpu: {
      model: cpuModel,
      cores: cpuCores,
      loadAverage1m: loadAvg[0].toFixed(2),
      loadAverage5m: loadAvg[1].toFixed(2),
      estimatedUsagePercent: cpuEstimatedPercent
    },
    memory: {
      totalMb: totalMemMb,
      usedMb: usedMemMb,
      freeMb: freeMemMb,
      usagePercent: memUsagePercent + '%'
    },
    system: {
      platform: os.platform(),
      release: os.release(),
      uptime: uptimeHours + ' hours'
    },
    view: metricsView
  };
}
