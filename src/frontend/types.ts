// ---------------------------------------------------------------------------
// types.ts -- shape of the /api response, mirroring dist/api.js's output.
// Every top-level section is optional: api.js only includes a section when
// the corresponding `display.*` config flag is enabled.
// ---------------------------------------------------------------------------

export interface StatsResponse {
    timestamp: number
    config: {
        display: Record<string, unknown>
        refreshInterval: number
        maxDataPoints: number
    }
    cpu?: {
        load: number
        loadUser: number
        loadSystem: number
        cores?: number[]
        temperature?: {
            main: number | null
        }
    }
    memory?: {
        total: number
        active: number
        usage: number
        swaptotal?: number
        swapused?: number
    }
    disk?: {
        filesystems?: Array<{
            mount: string
            size: number
            used: number
            use: number
        }>
    }
    network?: {
        interfaces?: Array<{
            iface: string
            ip4?: string | null
            ip6?: string | null
            mac?: string | null
            operstate?: string
            speed?: number | null
        }>
        stats?: Array<{
            iface: string
            rx_bytes?: number
            tx_bytes?: number
            rx_sec?: number
            tx_sec?: number
        }>
    }
    processes?: {
        all: number
        running: number
        top?: Array<{
            pid: number
            user: string
            name: string
            command: string
            cpu: number
            mem: number
        }>
    }
    system?: {
        fqdn?: string
        hostname?: string
        distro?: string
        release?: string
        arch?: string
        kernel?: string
        uptime?: number
        hardware?: {
            manufacturer?: string
            model?: string
        }
    }
}

export interface HfsSettings {
    theme?: 'auto' | 'light' | 'dark'
}
