// main.js

let cpuChart, memoryChart;
let cpuData = [], memoryData = [], timeLabels = [];
let maxDataPoints = 20;

let lastWindowId = null;
let bufferedCpuPoints = [];
let bufferedMemPoints = [];

let chartsActive = false;
let isMobile = false;
let lastSuccessTimestamp = Date.now();

function toggleThemeMode() {
    const store = localStorage.getItem('hfs_settings');
    const settings = store ? JSON.parse(store) : {};
    const current = settings.theme;
    let next = 'auto';
    if (current === 'auto' || current === null) next = 'light';
    else if (current === 'light') next = 'dark';
    
    settings.theme = next;
    localStorage.setItem('hfs_settings', JSON.stringify(settings));
    updateThemeButtonText(next);
}

function updateThemeButtonText(theme) {
    const displayTheme = theme === null ? 'auto' : theme;
    document.getElementById('themeToggle').textContent = `Theme: ${displayTheme.charAt(0).toUpperCase() + displayTheme.slice(1)}`;
}

function initCharts() {
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    const memoryCtx = document.getElementById('memoryChart').getContext('2d');
    
    const baseConfig = {
        type: 'line',
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { font: { size: 10 } } },
                x: { ticks: { font: { size: 9 } } }
            },
            elements: { point: { radius: 1, hoverRadius: 4 }, line: { borderWidth: 2 } },
            animation: { duration: 0 } 
        }
    };
    
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
                fill: true
            }]
        }
    });
    
    memoryChart = new Chart(memoryCtx, {
        ...baseConfig,
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Memory (15s Avg %)',
                data: memoryData,
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.05)',
                tension: 0.3,
                fill: true
            }]
        }
    });
}

function clearAndBundleFifteenSecondWindows(rawCpu, rawMem) {
    const currentTimeMs = Date.now();
    const currentWindowId = Math.floor(currentTimeMs / 15000);

    if (lastWindowId === null) {
        lastWindowId = currentWindowId;
    }

    if (currentWindowId !== lastWindowId) {
        if (bufferedCpuPoints.length > 0) {
            const calculatedCpuAvg = bufferedCpuPoints.reduce((a, b) => a + b, 0) / bufferedCpuPoints.length;
            const calculatedMemAvg = bufferedMemPoints.reduce((a, b) => a + b, 0) / bufferedMemPoints.length;
            const stampLabel = new Date(lastWindowId * 15000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            cpuData.push(parseFloat(calculatedCpuAvg.toFixed(1)));
            memoryData.push(parseFloat(calculatedMemAvg.toFixed(1)));
            timeLabels.push(stampLabel);

            if (cpuData.length > maxDataPoints) {
                cpuData.shift();
                memoryData.shift();
                timeLabels.shift();
            }

            if (chartsActive && cpuChart && memoryChart) {
                cpuChart.update();
                memoryChart.update();
            }
        }
        lastWindowId = currentWindowId;
        bufferedCpuPoints = [rawCpu];
        bufferedMemPoints = [rawMem];
    } else {
        bufferedCpuPoints.push(rawCpu);
        bufferedMemPoints.push(rawMem);
    }
}

function checkDeviceCapabilitiesAndSetupPlaceholders() {
    isMobile = window.innerWidth < 768;
    const cpuCover = document.getElementById('cpuMobilePlaceholder');
    const memCover = document.getElementById('memMobilePlaceholder');

    if (isMobile && !chartsActive) {
        cpuCover.classList.remove('hidden');
        memCover.classList.remove('hidden');
    } else {
        cpuCover.classList.add('hidden');
        memCover.classList.add('hidden');
        if (!chartsActive) {
            initCharts();
            chartsActive = true;
        }
    }
}

function loadMobileChartsDefensively() {
    document.getElementById('cpuMobilePlaceholder').classList.add('hidden');
    document.getElementById('memMobilePlaceholder').classList.add('hidden');
    if (!chartsActive) {
        initCharts();
        chartsActive = true;
        if (cpuChart && memoryChart) {
            cpuChart.update();
            memoryChart.update();
        }
    }
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    if (!seconds) return '0m';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

function kickstartUpdateTimer() {
    setInterval(() => {
        const secondsElapsed = Math.floor((Date.now() - lastSuccessTimestamp) / 1000);
        
        const dotElement = document.getElementById('statusDot');
        const textElement = document.getElementById('statusText');
        const stampElement = document.getElementById('lastUpdate');

        stampElement.textContent = `updated ${secondsElapsed}s ago`;

        if (secondsElapsed < 15) {
            dotElement.className = "pulse-dot w-3 h-3 bg-green-500 rounded-full mr-2";
            textElement.textContent = "Live";
        } else if (secondsElapsed >= 15 && secondsElapsed < 60) {
            dotElement.className = "w-3 h-3 bg-yellow-500 rounded-full mr-2";
            textElement.textContent = "Waiting";
        } else {
            dotElement.className = "w-3 h-3 bg-gray-400 rounded-full mr-2";
            textElement.textContent = "Offline";
        }
    }, 1000);
}

async function fetchStats() {
    try {
        const res = await fetch('/~/stats/api');
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        
        const data = await res.json();
        document.getElementById('errorAlert').classList.add('hidden');
        lastSuccessTimestamp = Date.now();
        
        if (data.config && data.config.maxDataPoints) {
            maxDataPoints = data.config.maxDataPoints;
        }

        if (data.system) {
            document.getElementById('systemFqdn').textContent = data.system.fqdn || data.system.hostname;
            document.getElementById('systemPlatform').textContent = `${data.system.distro} ${data.system.release} (${data.system.arch})`;
            document.getElementById('systemKernel').textContent = `Kernel: ${data.system.kernel}`;
            if (data.system.hardware) {
                document.getElementById('systemHardware').textContent = `Hardware: ${data.system.hardware.manufacturer} ${data.system.hardware.model}`;
            }
            document.getElementById('systemUptime').textContent = `Uptime: ${formatUptime(data.system.uptime)}`;
        }

        if (data.cpu) {
            const currentCpuLoad = data.cpu.load;
            document.getElementById('cpuUsage').textContent = `${currentCpuLoad.toFixed(1)}%`;
            document.getElementById('cpuDetails').textContent = `User: ${data.cpu.loadUser.toFixed(1)}% • Sys: ${data.cpu.loadSystem.toFixed(1)}%`;
            document.getElementById('cpuBar').style.width = `${currentCpuLoad}%`;
            
            if (data.cpu.cores) {
                document.getElementById('cpuCores').innerHTML = data.cpu.cores.map((load, i) => `
                    <div class="core-item">
                        Core ${i}
                        <div class="core-bar"><div class="core-bar-fill" style="width: ${load}%"></div></div>
                    </div>
                `).join('');
            }
            
            if (data.cpu.temperature && data.cpu.temperature.main !== null) {
                const degrees = data.cpu.temperature.main;
                document.getElementById('tempValue').textContent = `${degrees.toFixed(1)}°C`;
                const state = degrees < 60 ? 'Normal' : degrees < 80 ? 'Warm' : 'Hot';
                const classColor = degrees < 60 ? 'text-green-600' : degrees < 80 ? 'text-yellow-600' : 'text-red-600';
                document.getElementById('tempStatus').textContent = state;
                document.getElementById('tempStatus').className = `text-sm mt-1 font-medium ${classColor}`;
            }
            
            if (data.memory) {
                clearAndBundleFifteenSecondWindows(currentCpuLoad, data.memory.usage);
            }
        }

        if (data.memory) {
            const activeMemUsage = data.memory.usage.toFixed(1);
            document.getElementById('memUsage').textContent = `${activeMemUsage}%`;
            document.getElementById('memDetails').textContent = `${formatBytes(data.memory.active)} / ${formatBytes(data.memory.total)}`;
            document.getElementById('memBar').style.width = `${activeMemUsage}%`;
            
            const totalSwap = data.memory.swaptotal || 0;
            const activeSwap = data.memory.swapused || 0;
            const swapPercentage = totalSwap ? ((activeSwap / totalSwap) * 100).toFixed(1) : 0;
            document.getElementById('swapDetails').innerHTML = `
                <span>Swap: ${formatBytes(activeSwap)} / ${formatBytes(totalSwap)}</span>
                <span>${swapPercentage}%</span>
            `;
        }

        const diskBox = document.getElementById('diskContainer');
        if (data.disk && data.disk.filesystems) {
            diskBox.innerHTML = data.disk.filesystems.map(vol => `
                <div class="mb-3 last:mb-0">
                    <div class="flex justify-between text-xs mb-1 val">
                        <span class="font-semibold text-gray-700 truncate max-w-[120px]">${vol.mount}</span>
                        <span class="text-gray-400">${formatBytes(vol.used)} / ${formatBytes(vol.size)} (${vol.use}%)</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill ${vol.use > 90 ? 'bg-red-500' : 'bg-purple-500'}" style="width: ${vol.use}%"></div>
                    </div>
                </div>
            `).join('');
        }

        const netBox = document.getElementById('networkContainer');
        if (data.network && data.network.interfaces && data.network.stats) {
            const traceStats = {};
            data.network.stats.forEach(s => traceStats[s.iface] = s);

            netBox.innerHTML = data.network.interfaces.map(card => {
                const dataMetric = traceStats[card.iface];
                if (!dataMetric) return '';
                
                const ipv4 = card.ip4 || '-';
                const ipv6 = card.ip6 ? card.ip6.split('/')[0] : '-';
                const mac = card.mac || '-';
                const speed = card.speed ? `${card.speed} Mbps` : '-';
                
                return `
                    <div class="iface-card">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <span class="iface-name">${card.iface}</span>
                                <span class="iface-badge ${card.operstate === 'up' ? 'up' : 'down'}">${card.operstate}</span>
                            </div>
                            <span class="text-xs text-gray-500">${speed}</span>
                        </div>
                        <div class="space-y-1 text-xs">
                            <div class="font-mono text-gray-600"><span class="text-gray-400">IPv4:</span> ${ipv4}</div>
                            <div class="font-mono text-gray-600"><span class="text-gray-400">IPv6:</span> ${ipv6}</div>
                            <div class="font-mono text-gray-600"><span class="text-gray-400">MAC:</span> ${mac}</div>
                            <div class="flex justify-between text-gray-500 pt-1 border-t border-gray-200">
                                <span>↓ ${formatBytes(dataMetric.rx_sec)}/s</span>
                                <span>↑ ${formatBytes(dataMetric.tx_sec)}/s</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        const procBox = document.getElementById('processContainer');
        if (data.processes && data.processes.top) {
            document.getElementById('procSummary').textContent = `All: ${data.processes.all} | Active: ${data.processes.running}`;
            procBox.innerHTML = data.processes.top.map(p => `
                <tr class="border-b border-gray-100">
                    <td class="val text-gray-400 max-w-[50px]">${p.pid}</td>
                    <td class="max-w-[60px] truncate">${p.user}</td>
                    <td class="font-semibold text-gray-700 truncate max-w-[140px]" title="${p.command}">${p.name}</td>
                    <td class="val hidden sm:table-cell">
                        ${p.cpu.toFixed(1)}%
                        <div class="cpu-bar-inline hidden sm:inline-block" style="width: ${Math.min(p.cpu, 60)}px"></div>
                    </td>
                    <td class="val hidden sm:table-cell">
                        ${p.mem.toFixed(1)}%
                        <div class="mem-bar-inline hidden sm:inline-block" style="width: ${Math.min(p.mem, 60)}px"></div>
                    </td>
                </tr>
            `).join('');
        }

    } catch (err) {
        console.error('Data retrieval breakdown:', err);
        document.getElementById('errorAlert').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = err.message;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const store = localStorage.getItem('hfs_settings');
    const currentTheme = store ? JSON.parse(store).theme : null;
    updateThemeButtonText(currentTheme);
    
    document.getElementById('themeToggle').addEventListener('click', toggleThemeMode);
    
    checkDeviceCapabilitiesAndSetupPlaceholders();
    window.addEventListener('resize', checkDeviceCapabilitiesAndSetupPlaceholders);
    
    document.getElementById('cpuMobilePlaceholder').addEventListener('click', loadMobileChartsDefensively);
    document.getElementById('memMobilePlaceholder').addEventListener('click', loadMobileChartsDefensively);
    
    fetchStats();
    kickstartUpdateTimer();
    setInterval(fetchStats, 3000);
});
