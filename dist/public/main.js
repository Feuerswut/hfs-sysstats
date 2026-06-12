let cpuChart, memoryChart;
let cpuData = [], memoryData = [], timeLabels = [];
let maxDataPoints = 20;

// Initialize charts[cite: 2]
function initCharts() {
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    const memoryCtx = document.getElementById('memoryChart').getContext('2d');
    
    const chartConfig = {
        type: 'line',
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: { y: { beginAtZero: true, max: 100 } },
            elements: { point: { radius: 0 }, line: { borderWidth: 2 } },
            animation: { duration: 0 } // Disabled for smoother live updates
        }
    };
    
    cpuChart = new Chart(cpuCtx, {
        ...chartConfig,
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'CPU Usage (%)',
                data: cpuData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4, fill: true
            }]
        }
    });
    
    memoryChart = new Chart(memoryCtx, {
        ...chartConfig,
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Memory Usage (%)',
                data: memoryData,
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4, fill: true
            }]
        }
    });
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
    let str = '';
    if (days > 0) str += `${days}d `;
    if (hours > 0) str += `${hours}h `;
    str += `${minutes}m`;
    return str;
}

function updateCharts(cpuUsage, memUsage) {
    const now = new Date().toLocaleTimeString();
    
    cpuData.push(cpuUsage);
    memoryData.push(memUsage);
    timeLabels.push(now);
    
    if (cpuData.length > maxDataPoints) {
        cpuData.shift();
        memoryData.shift();
        timeLabels.shift();
    }
    
    cpuChart.update();
    memoryChart.update();
}

async function fetchStats() {
    try {
        const res = await fetch('/~/stats/api');
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        
        const data = await res.json();
        document.getElementById('errorAlert').classList.add('hidden');
        
        // Config Setup
        if (data.config && data.config.maxDataPoints) {
            maxDataPoints = data.config.maxDataPoints;
        }

        // --- 1. System Info ---
        if (data.system) {
            document.getElementById('systemFqdn').textContent = `Host: ${data.system.fqdn || data.system.hostname}`;
            document.getElementById('systemPlatform').textContent = `${data.system.distro} ${data.system.release} (${data.system.arch})`;
            document.getElementById('systemKernel').textContent = `Kernel: ${data.system.kernel}`;
            
            if (data.system.hardware && data.system.hardware.model) {
                document.getElementById('systemHardware').textContent = `Hardware: ${data.system.hardware.manufacturer} ${data.system.hardware.model}`;
            }
            document.getElementById('systemUptime').textContent = `Uptime: ${formatUptime(data.system.uptime)}`;
        }

        // --- 2. CPU ---
        if (data.cpu) {
            const cpuUsage = data.cpu.load.toFixed(1);
            document.getElementById('cpuUsage').textContent = `${cpuUsage}%`;
            document.getElementById('cpuDetails').textContent = `User: ${data.cpu.loadUser.toFixed(1)}% • Sys: ${data.cpu.loadSystem.toFixed(1)}%`;
            document.getElementById('cpuBar').style.width = `${cpuUsage}%`;
            
            // Build per-core grid
            if (data.cpu.cores && data.cpu.cores.length > 0) {
                document.getElementById('cpuCores').innerHTML = data.cpu.cores.map((load, i) => `
                    <div class="core-item">
                        Core ${i}
                        <div class="core-bar"><div class="core-bar-fill" style="width: ${load}%"></div></div>
                    </div>
                `).join('');
            }
            
            // Temperature
            if (data.cpu.temperature && data.cpu.temperature.main !== null) {
                const temp = data.cpu.temperature.main.toFixed(1);
                document.getElementById('tempValue').textContent = `${temp}°C`;
                const status = temp < 60 ? 'Normal' : temp < 80 ? 'Warm' : 'Hot';
                const color = temp < 60 ? 'text-green-600' : temp < 80 ? 'text-yellow-600' : 'text-red-600';
                document.getElementById('tempStatus').textContent = status;
                document.getElementById('tempStatus').className = `text-sm mt-1 font-medium ${color}`;
            } else {
                document.getElementById('tempValue').textContent = 'N/A';
                document.getElementById('tempStatus').textContent = 'Sensor unavailable';
                document.getElementById('tempStatus').className = 'text-sm mt-1 font-medium text-gray-500';
            }
        }

        // --- 3. Memory ---
        if (data.memory) {
            const memUsage = data.memory.usage.toFixed(1);
            document.getElementById('memUsage').textContent = `${memUsage}%`;
            document.getElementById('memDetails').textContent = `${formatBytes(data.memory.active)} / ${formatBytes(data.memory.total)}`;
            document.getElementById('memBar').style.width = `${memUsage}%`;
            
            const swapPerc = data.memory.swaptotal ? ((data.memory.swapused / data.memory.swaptotal) * 100).toFixed(1) : 0;
            document.getElementById('swapDetails').innerHTML = `
                <span>Swap: ${formatBytes(data.memory.swapused)} / ${formatBytes(data.memory.swaptotal)}</span>
                <span>${swapPerc}%</span>
            `;
        }
        
        // --- 4. Disks ---
        const diskCont = document.getElementById('diskContainer');
        if (data.disk && data.disk.filesystems && data.disk.filesystems.length > 0) {
            diskCont.innerHTML = data.disk.filesystems.map(fs => {
                const isCritical = fs.use > 90 ? 'bg-red-500' : 'bg-purple-500';
                return `
                    <div class="mb-3 last:mb-0">
                        <div class="flex justify-between text-sm mb-1">
                            <span class="font-semibold text-gray-700 truncate pr-2 val">${fs.mount}</span>
                            <span class="text-gray-500 whitespace-nowrap">${formatBytes(fs.used)} / ${formatBytes(fs.size)} (${fs.use}%)</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill ${isCritical}" style="width: ${fs.use}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            diskCont.innerHTML = '<p class="text-sm text-gray-500">No storage data available</p>';
        }

        // --- 5. Network ---
        const netCont = document.getElementById('networkContainer');
        if (data.network && data.network.interfaces && data.network.stats) {
            const statsMap = {};
            data.network.stats.forEach(s => statsMap[s.iface] = s);

            netCont.innerHTML = data.network.interfaces.map(iface => {
                const st = statsMap[iface.iface];
                if (!st) return '';
                const upClass = iface.operstate === 'up' ? 'up' : 'down';
                
                return `
                    <div class="iface-row">
                        <div class="flex justify-between items-center mb-1">
                            <div>
                                <span class="iface-name mr-2">${iface.iface}</span>
                                <span class="iface-badge ${upClass}">${iface.operstate}</span>
                            </div>
                            <div class="text-xs text-gray-500 text-right val">
                                <div><span class="text-green-500">▼</span> ${formatBytes(st.rx_sec)}/s</div>
                                <div><span class="text-blue-500">▲</span> ${formatBytes(st.tx_sec)}/s</div>
                            </div>
                        </div>
                        <div class="text-[11px] text-gray-400 flex justify-between val">
                            <span>IPv4: ${iface.ip4 || 'N/A'}</span>
                            <span>Tot: ${formatBytes(st.rx_bytes + st.tx_bytes)}</span>
                        </div>
                    </div>
                `;
            }).join('');
            if (netCont.innerHTML === '') netCont.innerHTML = '<p class="text-sm text-gray-500">No active network interfaces</p>';
        }

        // --- 6. Processes ---
        const procBody = document.getElementById('processContainer');
        if (data.processes && data.processes.top) {
            document.getElementById('procSummary').textContent = `Total: ${data.processes.all} | Running: ${data.processes.running}`;
            
            procBody.innerHTML = data.processes.top.map(p => `
                <tr>
                    <td class="val">${p.pid}</td>
                    <td>${p.user}</td>
                    <td title="${p.command}" class="font-semibold text-gray-700">${p.name}</td>
                    <td class="val">
                        ${p.cpu.toFixed(1)}%
                        <div class="cpu-bar-inline" style="width: ${Math.min(p.cpu, 100)}%"></div>
                    </td>
                    <td class="val">${p.mem.toFixed(1)}%</td>
                </tr>
            `).join('');
        }

        // Update charts and timestamp
        if (data.cpu && data.memory) {
            updateCharts(data.cpu.load, data.memory.usage);
        }
        document.getElementById('lastUpdate').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
        
    } catch (err) {
        console.error('Failed to fetch stats:', err);
        document.getElementById('errorAlert').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = err.message;
    }
}

// Initialization and automated polling
document.addEventListener('DOMContentLoaded', function() {
    console.log("System Dashboard initialized");
    initCharts();
    fetchStats();
    
    // Poll based on config or default to 3 seconds[cite: 4]
    setInterval(fetchStats, 3000); 
});
