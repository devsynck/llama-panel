const os = require('os');
const { exec } = require('child_process');

let lastStats = {
    ram: { used: 0, total: 0 },
    gpu: { utilization: 0, vramUsed: 0, vramTotal: 0, name: '', tempCore: 0, tempMem: 0, powerDraw: 0 }
};

let polling = false;

async function pollGPU() {
    return new Promise((resolve) => {
        exec('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,name,temperature.gpu,temperature.memory,power.draw --format=csv,noheader,nounits', (err, stdout) => {
            if (err) return resolve(null);
            try {
                let totalUtil = 0;
                let totalVramUsed = 0;
                let totalVramTotal = 0;
                let name = '';
                let tempCore = 0;
                let tempMem = 0;
                let powerDraw = 0;

                const lines = stdout.trim().split('\n').filter(l => l.trim() !== '');
                if (lines.length > 0) {
                    for (const line of lines) {
                        const parts = line.split(',').map(s => s.trim());
                        if (parts.length >= 7) {
                            totalUtil += parseFloat(parts[0]) || 0;
                            totalVramUsed += parseFloat(parts[1]) || 0;
                            totalVramTotal += parseFloat(parts[2]) || 0;
                            if (!name) name = parts[3];
                            tempCore += parseFloat(parts[4]) || 0;
                            if (parts[5] !== 'N/A' && parts[5] !== '[Not Supported]') tempMem += parseFloat(parts[5]) || 0;
                            powerDraw += parseFloat(parts[6]) || 0;
                        }
                    }
                    resolve({
                        utilization: (totalUtil / lines.length),
                        vramUsed: totalVramUsed,
                        vramTotal: totalVramTotal,
                        name: name,
                        tempCore: (tempCore / lines.length),
                        tempMem: (tempMem / lines.length),
                        powerDraw: (powerDraw / lines.length)
                    });
                } else {
                    resolve(null);
                }
            } catch (e) {
                resolve(null);
            }
        });
    });
}

async function updateStats() {
    if (polling) return;
    polling = true;
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        lastStats.ram = {
            used: totalMem - freeMem,
            total: totalMem
        };
        const gpuStats = await pollGPU();
        if (gpuStats) {
            lastStats.gpu = gpuStats;
        }
    } finally {
        polling = false;
    }
}

// Poll every 2 seconds
setInterval(updateStats, 2000);
updateStats();

module.exports = {
    get: () => lastStats
};
