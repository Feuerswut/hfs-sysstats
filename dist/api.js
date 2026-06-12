'use strict';

const { getConfig } = require('./config-manager');

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

const safe = (promise) =>
    Promise.resolve(promise).catch(() => null);

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleApiRequest(ctx, si) {
    try {
        const cfg     = getConfig();
        const display = cfg.display || {};
        const charts  = cfg.charts  || {};

        // ── Build parallel call map ──────────────────────────────────────────
        const pending = {
            time:    safe(si.time ? Promise.resolve(si.time()) : si.osInfo()),
            osInfo:  safe(si.osInfo()),
        };

        if (display.cpu !== false) {
            pending.cpuLoad = safe(si.currentLoad());
        }
        if (display.cpuCurrentSpeed !== false) {
            pending.cpuSpeed = safe(si.cpuCurrentSpeed());
        }
        if (display.cpuTemperature !== false) {
            pending.cpuTemp = safe(si.cpuTemperature());
        }
        if (display.memory !== false) {
            pending.mem = safe(si.mem());
        }
        if (display.memoryLayout) {
            pending.memLayout = safe(si.memLayout());
        }
        if (display.disk !== false) {
            pending.fsSize = safe(si.fsSize());
        }
        if (display.diskIO !== false) {
            pending.disksIO = safe(si.disksIO());
        }
        if (display.diskLayout) {
            pending.diskLayout = safe(si.diskLayout());
        }
        if (display.network !== false) {
            pending.netInterfaces = safe(si.networkInterfaces());
            const ifaces = resolveIfaceParam(cfg);
            pending.netStats = safe(si.networkStats(ifaces));
            if (display.networkLatency !== false) {
                pending.netLatency = safe(si.inetLatency());
            }
        }
        if (display.graphics !== false) {
            pending.graphics = safe(si.graphics());
        }
        if (display.processes !== false) {
            pending.processes = safe(si.processes());
        }
        if (display.docker !== false) {
            pending.dockerInfo       = safe(si.dockerInfo());
            pending.dockerContainers = safe(si.dockerContainers(true));
        }
        if (display.system !== false) {
            pending.sysInfo = safe(si.system());
        }
        if (display.battery !== false) {
            pending.battery = safe(si.battery());
        }

        // ── Resolve all in parallel ──────────────────────────────────────────
        const keys   = Object.keys(pending);
        const values = await Promise.all(keys.map(k => pending[k]));
        const r      = {};
        keys.forEach((k, i) => { r[k] = values[i]; });

        // ── Normalise time (si.time() is synchronous in some versions) ───────
        const timeObj  = r.time   || {};
        const osInfo   = r.osInfo || {};

        // ── Build response ───────────────────────────────────────────────────
        const response = {
            timestamp: Date.now(),
            config: {
                display,
                refreshInterval: charts.refreshInterval ?? 3000,
                maxDataPoints:   charts.maxDataPoints   ?? 20,
            },
        };

        // CPU
        if (display.cpu !== false && r.cpuLoad) {
            const cl = r.cpuLoad;
            response.cpu = {
                load:        cl.currentLoad       ?? 0,
                loadUser:    cl.currentLoadUser   ?? 0,
                loadSystem:  cl.currentLoadSystem ?? 0,
                loadNice:    cl.currentLoadNice   ?? 0,
                loadIdle:    cl.currentLoadIdle   ?? 0,
                loadIrq:     cl.currentLoadIrq    ?? 0,
                avgLoad:     cl.avgLoad           ?? 0,
                cores:       (cl.cpus || []).map(c => parseFloat((c.load ?? 0).toFixed(1))),
            };
            if (r.cpuSpeed) {
                response.cpu.speed = {
                    avg:   r.cpuSpeed.avg,
                    min:   r.cpuSpeed.min,
                    max:   r.cpuSpeed.max,
                    cores: r.cpuSpeed.cores || [],
                };
            }
            if (r.cpuTemp) {
                response.cpu.temperature = {
                    main:    r.cpuTemp.main,
                    cores:   r.cpuTemp.cores   || [],
                    max:     r.cpuTemp.max,
                    socket:  r.cpuTemp.socket  || [],
                    chipset: r.cpuTemp.chipset ?? null,
                };
            }
        }

        // Memory
        if (display.memory !== false && r.mem) {
            const m = r.mem;
            response.memory = {
                total:     m.total     ?? 0,
                free:      m.free      ?? 0,
                used:      m.used      ?? 0,
                active:    m.active    ?? 0,
                available: m.available ?? 0,
                buffcache: m.buffcache ?? 0,
                swaptotal: m.swaptotal ?? 0,
                swapused:  m.swapused  ?? 0,
                swapfree:  m.swapfree  ?? 0,
                // Use active (real usage excl. buffers/cache) for the headline %
                usage: m.total ? ((m.active / m.total) * 100) : 0,
            };
            if (display.memoryLayout && r.memLayout) {
                response.memory.layout = (r.memLayout || []).map(s => ({
                    size:         s.size,
                    bank:         s.bank,
                    type:         s.type,
                    clockSpeed:   s.clockSpeed,
                    formFactor:   s.formFactor,
                    manufacturer: s.manufacturer,
                }));
            }
        }

        // Disk
        if (display.disk !== false && r.fsSize) {
            const cfgMounts = (cfg.disk?.mounts?.[0] !== '*') ? cfg.disk.mounts : null;
            let fsList = (r.fsSize || []).filter(f => f.size > 0);
            if (cfgMounts) fsList = fsList.filter(f => cfgMounts.includes(f.mount));

            response.disk = {
                filesystems: fsList.map(f => ({
                    fs:        f.fs,
                    type:      f.type,
                    size:      f.size,
                    used:      f.used,
                    available: f.available,
                    use:       f.use,
                    mount:     f.mount,
                    rw:        f.rw,
                })),
            };
            if (display.diskIO !== false && r.disksIO) {
                const io = r.disksIO;
                response.disk.io = {
                    rIO:     io.rIO,
                    wIO:     io.wIO,
                    tIO:     io.tIO,
                    rIO_sec: io.rIO_sec,
                    wIO_sec: io.wIO_sec,
                    tIO_sec: io.tIO_sec,
                };
            }
            if (display.diskLayout && r.diskLayout) {
                response.disk.layout = (r.diskLayout || []).map(d => ({
                    device:        d.device,
                    type:          d.type,
                    name:          d.name,
                    vendor:        d.vendor,
                    size:          d.size,
                    interfaceType: d.interfaceType,
                    smartStatus:   d.smartStatus,
                    temperature:   d.temperature ?? null,
                }));
            }
        }

        // Network
        if (display.network !== false) {
            const showInternal = cfg.network?.showInternal ?? false;
            const showVirtual  = cfg.network?.showVirtual  ?? false;
            const cfgIfaces    = (cfg.network?.interfaces?.[0] !== '*')
                ? cfg.network.interfaces : null;

            let ifaces = (r.netInterfaces || []);
            if (!showInternal) ifaces = ifaces.filter(i => !i.internal);
            if (!showVirtual)  ifaces = ifaces.filter(i => !i.virtual);
            if (cfgIfaces)     ifaces = ifaces.filter(i => cfgIfaces.includes(i.iface));

            const ifaceNames = new Set(ifaces.map(i => i.iface));
            const stats = (r.netStats || []).filter(s => ifaceNames.has(s.iface));

            response.network = {
                interfaces: ifaces.map(i => ({
                    iface:     i.iface,
                    ip4:       i.ip4,
                    ip6:       i.ip6,
                    mac:       i.mac,
                    internal:  i.internal,
                    virtual:   i.virtual,
                    operstate: i.operstate,
                    type:      i.type,
                    speed:     i.speed,
                    dhcp:      i.dhcp,
                    default:   i.default,
                })),
                stats: stats.map(s => ({
                    iface:       s.iface,
                    operstate:   s.operstate,
                    rx_bytes:    s.rx_bytes,
                    tx_bytes:    s.tx_bytes,
                    rx_sec:      s.rx_sec,
                    tx_sec:      s.tx_sec,
                    rx_dropped:  s.rx_dropped,
                    tx_dropped:  s.tx_dropped,
                    rx_errors:   s.rx_errors,
                    tx_errors:   s.tx_errors,
                })),
            };
            if (r.netLatency !== undefined && r.netLatency !== null) {
                response.network.latency = r.netLatency;
            }
        }

        // Graphics
        if (display.graphics !== false && r.graphics) {
            response.graphics = {
                controllers: (r.graphics.controllers || []).map(c => ({
                    vendor:            c.vendor,
                    model:             c.model || c.name,
                    bus:               c.bus,
                    vram:              c.vram,
                    vramDynamic:       c.vramDynamic,
                    utilizationGpu:    c.utilizationGpu    ?? null,
                    utilizationMemory: c.utilizationMemory ?? null,
                    temperatureGpu:    c.temperatureGpu    ?? null,
                    memoryUsed:        c.memoryUsed        ?? null,
                    memoryFree:        c.memoryFree        ?? null,
                    memoryTotal:       c.memoryTotal       ?? null,
                    fanSpeed:          c.fanSpeed          ?? null,
                    powerDraw:         c.powerDraw         ?? null,
                    driverVersion:     c.driverVersion     ?? null,
                })),
                displays: (r.graphics.displays || []).map(d => ({
                    model:              d.model,
                    main:               d.main,
                    builtin:            d.builtin,
                    connection:         d.connection,
                    resolutionX:        d.resolutionX,
                    resolutionY:        d.resolutionY,
                    currentResX:        d.currentResX,
                    currentResY:        d.currentResY,
                    currentRefreshRate: d.currentRefreshRate,
                })),
            };
        }

        // Processes
        if (display.processes !== false && r.processes) {
            const topN  = display.processesTop ?? 10;
            const procs = r.processes;
            const top   = (procs.list || [])
                .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
                .slice(0, topN)
                .map(p => ({
                    pid:     p.pid,
                    name:    p.name,
                    cpu:     parseFloat((p.cpu  ?? 0).toFixed(1)),
                    mem:     parseFloat((p.mem  ?? 0).toFixed(1)),
                    memRss:  p.memRss,
                    state:   p.state,
                    user:    p.user,
                    command: p.command,
                }));
            response.processes = {
                all:      procs.all      ?? 0,
                running:  procs.running  ?? 0,
                blocked:  procs.blocked  ?? 0,
                sleeping: procs.sleeping ?? 0,
                top,
            };
        }

        // Docker
        if (display.docker !== false && r.dockerInfo) {
            const di = r.dockerInfo;
            response.docker = {
                info: {
                    containers:         di.containers,
                    containersRunning:  di.containersRunning,
                    containersPaused:   di.containersPaused,
                    containersStopped:  di.containersStopped,
                    images:             di.images,
                    serverVersion:      di.serverVersion,
                    driver:             di.driver,
                },
            };
            if (r.dockerContainers) {
                response.docker.containers = (r.dockerContainers || []).map(c => ({
                    id:        (c.id || '').substring(0, 12),
                    name:      c.name,
                    image:     c.image,
                    state:     c.state,
                    startedAt: c.startedAt,
                    ports:     (c.ports || []).slice(0, 4), // cap for readability
                }));
            }
        }

        // Battery
        if (display.battery !== false && r.battery && r.battery.hasBattery) {
            const bat = r.battery;
            response.battery = {
                hasBattery:       bat.hasBattery,
                isCharging:       bat.isCharging,
                acConnected:      bat.acConnected,
                percent:          bat.percent,
                timeRemaining:    bat.timeRemaining,
                cycleCount:       bat.cycleCount,
                voltage:          bat.voltage,
                designedCapacity: bat.designedCapacity,
                maxCapacity:      bat.maxCapacity,
                currentCapacity:  bat.currentCapacity,
                capacityUnit:     bat.capacityUnit,
                type:             bat.type,
                model:            bat.model,
                manufacturer:     bat.manufacturer,
            };
        }

        // System (always present)
        response.system = {
            platform:     osInfo.platform     || 'Unknown',
            distro:       osInfo.distro       || 'Unknown',
            release:      osInfo.release      || 'Unknown',
            arch:         osInfo.arch         || 'Unknown',
            hostname:     osInfo.hostname     || 'Unknown',
            kernel:       osInfo.kernel       || '',
            fqdn:         osInfo.fqdn         || '',
            uptime:       timeObj.uptime      ?? 0,
            timezone:     timeObj.timezone    || '',
            timezoneName: timeObj.timezoneName || '',
        };
        if (display.system !== false && r.sysInfo) {
            response.system.hardware = {
                manufacturer: r.sysInfo.manufacturer,
                model:        r.sysInfo.model,
                version:      r.sysInfo.version,
                virtual:      r.sysInfo.virtual,
                virtualHost:  r.sysInfo.virtualHost,
            };
        }

        ctx.type = 'application/json';
        ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        ctx.body = JSON.stringify(response);

    } catch (err) {
        ctx.status = 500;
        ctx.type   = 'application/json';
        ctx.body   = JSON.stringify({ error: 'Failed to retrieve system information', details: err.message });
    }
    ctx.stop();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveIfaceParam(cfg) {
    const ifaces = cfg.network?.interfaces;
    if (!ifaces || ifaces[0] === '*') return '*';
    return ifaces.join(',');
}

module.exports = { handleApiRequest };
