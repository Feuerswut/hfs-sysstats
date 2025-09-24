const si = require('systeminformation');
const path = require('path');
const fs = require('fs');

// General function to serve files from disk (HTML, CSS, JS, etc.)
function serveFile(ctx, filePath) {
    try {
        // Use provided path or default to index.html
        const fullPath = filePath || path.join(__dirname, 'public', 'index.html');
        
        // Check if file exists
        if (!fs.existsSync(fullPath)) {
            ctx.res.writeHead(404, { 'Content-Type': 'text/plain' });
            ctx.res.end(`File not found: ${path.basename(fullPath)}`);
            return true;
        }
        
        // Determine content type based on file extension
        const extname = path.extname(fullPath);
        let contentType = 'text/plain';
        
        switch (extname) {
            case '.html':
                contentType = 'text/html; charset=utf-8';
                break;
            case '.css':
                contentType = 'text/css';
                break;
            case '.js':
                contentType = 'application/javascript';
                break;
            case '.json':
                contentType = 'application/json';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.svg':
                contentType = 'image/svg+xml';
                break;
        }
        
        // Serve the file with appropriate content type
        ctx.res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        
        // For binary files like images, use a stream instead of readFileSync
        if (contentType.startsWith('image/')) {
            const stream = fs.createReadStream(fullPath);
            stream.pipe(ctx.res);
        } else {
            // For text files, read and send directly
            const content = fs.readFileSync(fullPath, 'utf8');
            ctx.res.end(content);
        }
        
        return true;
    } catch (err) {
        ctx.res.writeHead(500, { 'Content-Type': 'text/plain' });
        ctx.res.end('Error serving file: ' + err.message);
        return true;
    }
}

exports.middleware = async (ctx) => {
    const url = ctx.req.url;
    
    // Only intercept /~/stats requests
    if (!url.startsWith('/~/stats')) {
        return false; // Let HFS continue processing
    }
    
    // New API endpoint at /~/stats/api
    if (url === '/~/stats/api') {
        try {
            const [cpu, mem, disk, temp, network, osInfo, uptime] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize(),
                si.cpuTemperature(),
                si.networkStats(),
                si.osInfo(),
                si.time()
            ]);
            
            const data = {
                timestamp: Date.now(),
                cpu: {
                    load: cpu.currentLoad || 0,
                    loadUser: cpu.currentLoadUser || 0,
                    loadSystem: cpu.currentLoadSystem || 0,
                    cores: cpu.cpus?.length || 0
                },
                memory: {
                    total: mem.total || 0,
                    used: mem.used || 0,
                    free: mem.free || 0,
                    available: mem.available || 0,
                    usage: mem.total ? ((mem.used / mem.total) * 100) : 0
                },
                disk: disk && disk.length > 0 ? {
                    total: disk[0].size || 0,
                    used: disk[0].used || 0,
                    available: disk[0].available || 0,
                    usage: disk[0].size ? ((disk[0].used / disk[0].size) * 100) : 0,
                    filesystem: disk[0].fs || 'Unknown'
                } : null,
                temperature: {
                    main: temp.main || null,
                    cores: temp.cores || [],
                    max: temp.max || null
                },
                network: network && network.length > 0 ? {
                    interface: network[0].iface || 'Unknown',
                    rx_bytes: network[0].rx_bytes || 0,
                    tx_bytes: network[0].tx_bytes || 0,
                    rx_sec: network[0].rx_sec || 0,
                    tx_sec: network[0].tx_sec || 0
                } : null,
                system: {
                    platform: osInfo.platform || 'Unknown',
                    distro: osInfo.distro || 'Unknown',
                    release: osInfo.release || 'Unknown',
                    arch: osInfo.arch || 'Unknown',
                    hostname: osInfo.hostname || 'Unknown',
                    uptime: uptime.uptime || 0
                }
            };
            
            ctx.res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            ctx.res.end(JSON.stringify(data, null, 2));
        } catch (err) {
            ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
            ctx.res.end(JSON.stringify({ error: 'Failed to retrieve system information', details: err.message }));
        }
        return true;
    }
    
    // For the main /~/stats path, serve index.html
    if (url === '/~/stats' || url === '/~/stats/') {
        return serveFile(ctx);
    }

    // For files requested through index.html (css, js, images, etc.)
    if (url.startsWith('/~/stats/')) {
        const requestedFile = url.substring('/~/stats/'.length);
        if (requestedFile) {
            const filePath = path.join(__dirname, 'public', requestedFile);
            return serveFile(ctx, filePath);
        }
    }
    
    // For debugging - respond with clear text if no other condition is met
    ctx.res.writeHead(200, { 'Content-Type': 'text/plain' });
    ctx.res.end(`Request path "${url}" not handled specifically. Check your routes.`);
    return true;
};

// Plugin metadata for HFS v3
exports.description = 'System Statistics Dashboard - Real-time monitoring of CPU, memory, disk, temperature and network stats';
exports.version = '1.1.0';
exports.author = 'HFS Stats Plugin';
exports.require = '^0.50.0'; // HFS version requirement
exports.apiRequired = '3.0'; // API version requirement