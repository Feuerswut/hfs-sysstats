let cpuChart, memoryChart;
let cpuData = [], memoryData = [], timeLabels = [];
const maxDataPoints = 20;

// Initialize charts
function initCharts() {
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    const memoryCtx = document.getElementById('memoryChart').getContext('2d');
    
    const chartConfig = {
        type: 'line',
        options: {
            responsive: true,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                y: { beginAtZero: true, max: 100 }
            },
            elements: { point: { radius: 3 } },
            animation: { duration: 300 }
        }
    };
    
    cpuChart = new Chart(cpuCtx, {
        ...chartConfig,
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'CPU Usage (%)',
                data: cpuData,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
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
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4,
                fill: true
            }]
        }
    });
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

function updateCharts(cpuUsage, memUsage) {
    const now = new Date().toLocaleTimeString();
    
    // Add new data
    cpuData.push(cpuUsage);
    memoryData.push(memUsage);
    timeLabels.push(now);
    
    // Remove old data if we have too many points
    if (cpuData.length > maxDataPoints) {
        cpuData.shift();
        memoryData.shift();
        timeLabels.shift();
    }
    
    // Update charts
    cpuChart.update('none');
    memoryChart.update('none');
}

async function fetchStats() {
    try {
        document.getElementById('errorAlert').classList.add('hidden');
        
        const res = await fetch('/~/stats/api');
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        
        const data = await res.json();
        
        // Update CPU
        const cpuUsage = data.cpu.load.toFixed(1);
        document.getElementById('cpuUsage').textContent = `${cpuUsage}%`;
        document.getElementById('cpuDetails').textContent = `${data.cpu.cores} cores • User: ${data.cpu.loadUser.toFixed(1)}% • System: ${data.cpu.loadSystem.toFixed(1)}%`;
        document.getElementById('cpuBar').style.width = `${cpuUsage}%`;
        
        // Update Memory
        const memUsage = data.memory.usage.toFixed(1);
        document.getElementById('memUsage').textContent = `${memUsage}%`;
        document.getElementById('memDetails').textContent = `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`;
        document.getElementById('memBar').style.width = `${memUsage}%`;
        
        // Update Disk
        if (data.disk) {
            const diskUsage = data.disk.usage.toFixed(1);
            document.getElementById('diskUsage').textContent = `${diskUsage}%`;
            document.getElementById('diskDetails').textContent = `${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)} • ${data.disk.filesystem}`;
            document.getElementById('diskBar').style.width = `${diskUsage}%`;
        } else {
            document.getElementById('diskUsage').textContent = 'N/A';
            document.getElementById('diskDetails').textContent = 'No disk information available';
        }
        
        // Update Temperature
        if (data.temperature.main !== null) {
            const temp = data.temperature.main;
            document.getElementById('tempValue').textContent = `${temp}°C`;
            const status = temp < 60 ? 'Normal' : temp < 80 ? 'Warm' : 'Hot';
            const color = temp < 60 ? 'text-green-600' : temp < 80 ? 'text-yellow-600' : 'text-red-600';
            document.getElementById('tempStatus').textContent = status;
            document.getElementById('tempStatus').className = `text-sm ${color}`;
        } else {
            document.getElementById('tempValue').textContent = 'N/A';
            document.getElementById('tempStatus').textContent = 'Temperature sensor not available';
        }
        
        // Update Network
        if (data.network) {
            document.getElementById('networkInterface').textContent = data.network.interface;
            document.getElementById('networkRx').textContent = formatBytes(data.network.rx_bytes);
            document.getElementById('networkTx').textContent = formatBytes(data.network.tx_bytes);
        } else {
            document.getElementById('networkInterface').textContent = 'No network data';
            document.getElementById('networkRx').textContent = 'N/A';
            document.getElementById('networkTx').textContent = 'N/A';
        }
        
        // Update System Info
        document.getElementById('systemPlatform').textContent = `${data.system.distro} ${data.system.release} (${data.system.arch})`;
        document.getElementById('systemUptime').textContent = `Uptime: ${formatUptime(data.system.uptime)}`;
        
        // Update charts
        updateCharts(parseFloat(cpuUsage), parseFloat(memUsage));
        
        // Update timestamp
        document.getElementById('lastUpdate').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
        
    } catch (err) {
        console.error('Failed to fetch stats:', err);
        document.getElementById('errorAlert').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = err.message;
        
        // Update with error state
        ['cpuUsage', 'memUsage', 'diskUsage', 'tempValue'].forEach(id => {
            document.getElementById(id).textContent = 'Error';
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log("main.js loaded");
    initCharts();
    fetchStats(); // Initial load
    setInterval(fetchStats, 3000); // Update every 3 seconds
});