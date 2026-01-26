// Plugin metadata for HFS v3
exports.version = '1.2';
exports.description = 'System Statistics Dashboard - Real-time monitoring of CPU, memory, disk, temperature and network stats';
exports.apiRequired = '8.65'; // ctx API version

exports.author = 'Feuerswut';
exports.repo = "Feuerswut/hfs-sysstats"

exports.config = {
    allowPublicAccess: {
        type: 'boolean',
        defaultValue: false,
        helperText: "Allow Users to access the Stats panel without login.",
        xs: 6,
    },
    hideFromUnauthorized: {
        type: 'boolean',
        defaultValue: false,
        helperText: "Make the plugin invisible to non-logged users (returns nothing instead of 403).",
        xs: 6,
    },
}

exports.changelog = [
    { "version": 1.1, "message": "Hide from Unauthorized, Modern Plugin Pattern" }
]

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
            ctx.status = 404;
            ctx.type = 'text/plain';
            ctx.body = `File not found: ${path.basename(fullPath)}`;
            ctx.stop();
            return;
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
        
        ctx.type = contentType;
        ctx.set('Cache-Control', 'no-cache');
        
        // For binary files like images, use a stream
        if (contentType.startsWith('image/')) {
            ctx.body = fs.createReadStream(fullPath);
        } else {
            // For text files, read and send directly
            ctx.body = fs.readFileSync(fullPath, 'utf8');
        }
        
        ctx.stop();
    } catch (err) {
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Error serving file: ' + err.message;
        ctx.stop();
    }
}

exports.init = async api => {
    const auth = api.require('./auth');
    const getCurrentUsername = auth.getCurrentUsername;

    // Return middleware with access to api
    return { middleware }

    // Define middleware inside the init scope so it has access to api
    async function middleware(ctx) {

        const url = ctx.req.url;

        // Only intercept /~/stats requests
        if (!url.startsWith('/~/stats')) {
            return; // Let HFS continue processing
        }

        // check if the user is authenticated
        const username = getCurrentUsername(ctx);
        if (!username) {
            // If anonymous access is not allowed, block access
            const allowPublicAccess = api.getConfig('allowPublicAccess');            
            if (allowPublicAccess === false) {
                const hideFromUnauthorized = api.getConfig('hideFromUnauthorized');
                if (hideFromUnauthorized) {
                    return; // Pretend the plugin doesn't exist
                }
                ctx.status = 403;
                ctx.body = '';
                ctx.stop();
                return;
            }
        }
        
        // API endpoint at /~/stats/api
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
                
                ctx.type = 'application/json';
                ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                ctx.body = JSON.stringify(data, null, 2);
            } catch (err) {
                ctx.status = 500;
                ctx.type = 'application/json';
                ctx.body = JSON.stringify({ error: 'Failed to retrieve system information', details: err.message });
            }
            ctx.stop();
            return;
        }
        
        // For the main /~/stats path, serve index.html
        if (url === '/~/stats' || url === '/~/stats/') {
            serveFile(ctx);
            return;
        }

        // For files requested through index.html (css, js, images, etc.)
        if (url.startsWith('/~/stats/')) {
            const requestedFile = url.substring('/~/stats/'.length);
            if (requestedFile) {
                const filePath = path.join(__dirname, 'public', requestedFile);
                serveFile(ctx, filePath);
                return;
            }
        }
    };
}
