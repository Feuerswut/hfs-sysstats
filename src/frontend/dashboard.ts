// ---------------------------------------------------------------------------
// dashboard.ts -- polling, rendering and the CPU/Memory history charts.
// Ported from the previous plain-JS main.js with the same behaviour: a
// 15-second averaging window for the charts, a mobile tap-to-load gate for
// the (heavier) chart canvases, and a live/waiting/offline status pill.
//
// Chart.js is loaded globally via a plain <script> tag (see index.html) --
// there is no bundler-managed dependency on it, so it is declared here as an
// ambient global rather than imported.
// ---------------------------------------------------------------------------

import type { StatsResponse } from './types'

declare const Chart: any

let cpuChart: any = null
let memoryChart: any = null
let cpuData: number[] = []
let memoryData: number[] = []
let timeLabels: string[] = []
let maxDataPoints = 20

// 15-second averaging window state
let lastWindowId: number | null = null
let bufferedCpuPoints: number[] = []
let bufferedMemPoints: number[] = []

// Mobile chart gating
let chartsActive = false
let isMobile = false
let lastSuccessTimestamp = Date.now()

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null
}

function initCharts(): void {
    const cpuCanvas = el<HTMLCanvasElement>('cpuChart')
    const memCanvas = el<HTMLCanvasElement>('memoryChart')
    if (!cpuCanvas || !memCanvas) return

    const cpuCtx = cpuCanvas.getContext('2d')
    const memCtx = memCanvas.getContext('2d')

    const baseConfig = {
        type: 'line',
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { font: { size: 10 } } },
                x: { ticks: { font: { size: 9 } } },
            },
            elements: { point: { radius: 1, hoverRadius: 4 }, line: { borderWidth: 2 } },
            animation: { duration: 0 },
        },
    }

    cpuChart = new Chart(cpuCtx, {
        ...baseConfig,
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'CPU (15s Avg %)',
                data: cpuData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                tension: 0.3,
                fill: true,
            }],
        },
    })

    memoryChart = new Chart(memCtx, {
        ...baseConfig,
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Memory (15s Avg %)',
                data: memoryData,
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.05)',
                tension: 0.3,
                fill: true,
            }],
        },
    })
}

function bundleFifteenSecondWindows(rawCpu: number, rawMem: number): void {
    const currentTimeMs = Date.now()
    const currentWindowId = Math.floor(currentTimeMs / 15000)

    if (lastWindowId === null) lastWindowId = currentWindowId

    if (currentWindowId !== lastWindowId) {
        if (bufferedCpuPoints.length > 0) {
            const cpuAvg = bufferedCpuPoints.reduce((a, b) => a + b, 0) / bufferedCpuPoints.length
            const memAvg = bufferedMemPoints.reduce((a, b) => a + b, 0) / bufferedMemPoints.length
            const stampLabel = new Date(lastWindowId * 15000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

            cpuData.push(parseFloat(cpuAvg.toFixed(1)))
            memoryData.push(parseFloat(memAvg.toFixed(1)))
            timeLabels.push(stampLabel)

            if (cpuData.length > maxDataPoints) {
                cpuData.shift()
                memoryData.shift()
                timeLabels.shift()
            }

            if (chartsActive && cpuChart && memoryChart) {
                cpuChart.update()
                memoryChart.update()
            }
        }
        lastWindowId = currentWindowId
        bufferedCpuPoints = [rawCpu]
        bufferedMemPoints = [rawMem]
    } else {
        bufferedCpuPoints.push(rawCpu)
        bufferedMemPoints.push(rawMem)
    }
}

function checkDeviceCapabilitiesAndSetupPlaceholders(): void {
    isMobile = window.innerWidth < 768
    const cpuCover = el('cpuMobilePlaceholder')
    const memCover = el('memMobilePlaceholder')
    if (!cpuCover || !memCover) return

    if (isMobile && !chartsActive) {
        cpuCover.classList.add('is-visible')
        memCover.classList.add('is-visible')
    } else {
        cpuCover.classList.remove('is-visible')
        memCover.classList.remove('is-visible')
        if (!chartsActive) {
            initCharts()
            chartsActive = true
        }
    }
}

function loadMobileChartsDefensively(): void {
    el('cpuMobilePlaceholder')?.classList.remove('is-visible')
    el('memMobilePlaceholder')?.classList.remove('is-visible')
    if (!chartsActive) {
        initCharts()
        chartsActive = true
        if (cpuChart && memoryChart) {
            cpuChart.update()
            memoryChart.update()
        }
    }
}

function formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatUptime(seconds?: number): string {
    if (!seconds) return '0m'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`
}

function kickstartUpdateTimer(): void {
    setInterval(() => {
        const secondsElapsed = Math.floor((Date.now() - lastSuccessTimestamp) / 1000)

        const dotEl = el('statusDot')
        const textEl = el('statusText')
        const stampEl = el('lastUpdate')
        if (!dotEl || !textEl || !stampEl) return

        stampEl.textContent = `updated ${secondsElapsed}s ago`

        dotEl.classList.remove('is-waiting', 'is-offline')
        if (secondsElapsed < 15) {
            textEl.textContent = 'Live'
        } else if (secondsElapsed < 60) {
            dotEl.classList.add('is-waiting')
            textEl.textContent = 'Waiting'
        } else {
            dotEl.classList.add('is-offline')
            textEl.textContent = 'Offline'
        }
    }, 1000)
}

async function fetchStats(): Promise<void> {
    try {
        // Relative URL: the backend redirects the bare canonical path to one
        // with a trailing slash, so this always resolves to
        // `<canonical>/api` regardless of the plugin's folder name.
        const res = await fetch('api')
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

        const data = await res.json() as StatsResponse
        el('errorAlert')?.classList.add('is-hidden')
        lastSuccessTimestamp = Date.now()

        if (data.config?.maxDataPoints) maxDataPoints = data.config.maxDataPoints

        if (data.system) {
            const fqdnEl = el('systemFqdn')
            if (fqdnEl) fqdnEl.textContent = data.system.fqdn || data.system.hostname || 'Unknown host'
            const platformEl = el('systemPlatform')
            if (platformEl) platformEl.textContent = `${data.system.distro} ${data.system.release} (${data.system.arch})`
            const kernelEl = el('systemKernel')
            if (kernelEl) kernelEl.textContent = `Kernel: ${data.system.kernel}`
            if (data.system.hardware) {
                const hwEl = el('systemHardware')
                if (hwEl) hwEl.textContent = `Hardware: ${data.system.hardware.manufacturer} ${data.system.hardware.model}`
            }
            const uptimeEl = el('systemUptime')
            if (uptimeEl) uptimeEl.textContent = `Uptime: ${formatUptime(data.system.uptime)}`
        }

        if (data.cpu) {
            const currentCpuLoad = data.cpu.load
            const usageEl = el('cpuUsage')
            if (usageEl) usageEl.textContent = `${currentCpuLoad.toFixed(1)}%`
            const detailsEl = el('cpuDetails')
            if (detailsEl) detailsEl.textContent = `User: ${data.cpu.loadUser.toFixed(1)}% • Sys: ${data.cpu.loadSystem.toFixed(1)}%`
            const barEl = el('cpuBar')
            if (barEl) barEl.style.width = `${currentCpuLoad}%`

            if (data.cpu.cores) {
                const coresEl = el('cpuCores')
                if (coresEl) {
                    coresEl.innerHTML = data.cpu.cores.map((load, i) => `
                        <div class="core-item">
                            Core ${i}
                            <div class="core-bar"><div class="core-bar__fill" style="width: ${load}%"></div></div>
                        </div>
                    `).join('')
                }
            }

            if (data.cpu.temperature && data.cpu.temperature.main !== null) {
                const degrees = data.cpu.temperature.main
                const tempEl = el('tempValue')
                if (tempEl) tempEl.textContent = `${degrees.toFixed(1)}°C`
                const state = degrees < 60 ? 'Normal' : degrees < 80 ? 'Warm' : 'Hot'
                const stateClass = degrees < 60 ? 'metric-status--good' : degrees < 80 ? 'metric-status--warn' : 'metric-status--bad'
                const statusEl = el('tempStatus')
                if (statusEl) {
                    statusEl.textContent = state
                    statusEl.className = `metric-status ${stateClass}`
                }
            }

            if (data.memory) bundleFifteenSecondWindows(currentCpuLoad, data.memory.usage)
        }

        if (data.memory) {
            const activeMemUsage = data.memory.usage.toFixed(1)
            const usageEl = el('memUsage')
            if (usageEl) usageEl.textContent = `${activeMemUsage}%`
            const detailsEl = el('memDetails')
            if (detailsEl) detailsEl.textContent = `${formatBytes(data.memory.active)} / ${formatBytes(data.memory.total)}`
            const barEl = el('memBar')
            if (barEl) barEl.style.width = `${activeMemUsage}%`

            const totalSwap = data.memory.swaptotal || 0
            const activeSwap = data.memory.swapused || 0
            const swapPercentage = totalSwap ? ((activeSwap / totalSwap) * 100).toFixed(1) : '0'
            const swapEl = el('swapDetails')
            if (swapEl) {
                swapEl.innerHTML = `
                    <span>Swap: ${formatBytes(activeSwap)} / ${formatBytes(totalSwap)}</span>
                    <span>${swapPercentage}%</span>
                `
            }
        }

        const diskBox = el('diskContainer')
        if (diskBox && data.disk?.filesystems) {
            diskBox.innerHTML = data.disk.filesystems.map(vol => `
                <div class="disk-row">
                    <div class="disk-row-header">
                        <span class="disk-mount">${vol.mount}</span>
                        <span class="disk-size">${formatBytes(vol.used)} / ${formatBytes(vol.size)} (${vol.use}%)</span>
                    </div>
                    <div class="progress-track progress-track--tight">
                        <div class="progress-fill ${vol.use > 90 ? 'progress-fill--red' : 'progress-fill--purple'}" style="width: ${vol.use}%"></div>
                    </div>
                </div>
            `).join('')
        }

        const netBox = el('networkContainer')
        if (netBox && data.network?.interfaces && data.network.stats) {
            type NetStat = NonNullable<NonNullable<StatsResponse['network']>['stats']>[number]
            const traceStats: Record<string, NetStat> = {}
            for (const s of data.network.stats) traceStats[s.iface] = s

            netBox.innerHTML = data.network.interfaces.map(card => {
                const dataMetric = traceStats[card.iface]
                if (!dataMetric) return ''

                const ipv4 = card.ip4 || null
                const ipv6 = card.ip6 || null
                const mac = card.mac || null
                const speed = card.speed != null && card.speed > 0 ? `${card.speed} Mbps` : null

                const rxTotal = dataMetric.rx_bytes != null ? formatBytes(dataMetric.rx_bytes) : null
                const txTotal = dataMetric.tx_bytes != null ? formatBytes(dataMetric.tx_bytes) : null

                return `
                    <div class="iface-row">
                        <div class="iface-row__top">
                            <div>
                                <span class="iface-name">${card.iface}</span>
                                <span class="iface-badge ${card.operstate === 'up' ? 'up' : 'down'}">${card.operstate}</span>
                            </div>
                            <div class="iface-throughput">
                                <div>↓ ${formatBytes(dataMetric.rx_sec)}/s</div>
                                <div>↑ ${formatBytes(dataMetric.tx_sec)}/s</div>
                            </div>
                        </div>
                        <div class="iface-details">
                            ${ipv4 ? `<div><span class="iface-label">IPv4</span><span class="iface-value">${ipv4}</span></div>` : ''}
                            ${ipv6 ? `<div><span class="iface-label">IPv6</span><span class="iface-value iface-value--ip6">${ipv6}</span></div>` : ''}
                            ${mac ? `<div><span class="iface-label">MAC</span><span class="iface-value">${mac}</span></div>` : ''}
                            ${speed ? `<div><span class="iface-label">Speed</span><span class="iface-value">${speed}</span></div>` : ''}
                            ${(rxTotal || txTotal) ? `<div><span class="iface-label">Total</span><span class="iface-value">↓${rxTotal ?? '–'} ↑${txTotal ?? '–'}</span></div>` : ''}
                        </div>
                    </div>
                `
            }).join('')
        }

        const procBox = el('processContainer')
        if (procBox && data.processes?.top) {
            const summaryEl = el('procSummary')
            if (summaryEl) summaryEl.textContent = `All: ${data.processes.all} | Active: ${data.processes.running}`
            procBox.innerHTML = data.processes.top.map(p => `
                <tr>
                    <td class="val pid-col">${p.pid}</td>
                    <td class="user-col">${p.user}</td>
                    <td class="cmd-col" title="${p.command}">${p.name}</td>
                    <td class="val cpu-val-col">${p.cpu.toFixed(1)}%</td>
                    <td class="bar-col desktop-only">
                        <div class="proc-bar-track">
                            <div class="proc-bar-fill proc-bar-fill--blue" style="width: ${Math.min(p.cpu, 100)}%"></div>
                        </div>
                    </td>
                    <td class="val mem-val-col">${p.mem.toFixed(1)}%</td>
                    <td class="bar-col desktop-only">
                        <div class="proc-bar-track">
                            <div class="proc-bar-fill proc-bar-fill--green" style="width: ${Math.min(p.mem, 100)}%"></div>
                        </div>
                    </td>
                </tr>
            `).join('')
        }
    } catch (err) {
        console.error('Data retrieval breakdown:', err)
        el('errorAlert')?.classList.remove('is-hidden')
        const msgEl = el('errorMessage')
        if (msgEl) msgEl.textContent = err instanceof Error ? err.message : String(err)
    }
}

export function initDashboard(): void {
    checkDeviceCapabilitiesAndSetupPlaceholders()
    window.addEventListener('resize', checkDeviceCapabilitiesAndSetupPlaceholders)

    el('cpuMobilePlaceholder')?.addEventListener('click', loadMobileChartsDefensively)
    el('memMobilePlaceholder')?.addEventListener('click', loadMobileChartsDefensively)

    fetchStats()
    kickstartUpdateTimer()
    setInterval(fetchStats, 3000)
}
