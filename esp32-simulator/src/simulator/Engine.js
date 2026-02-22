/**
 * Engine — Main simulation engine
 * Orchestrates Arduino code parsing, pin management, and peripheral updates
 */
import { PinManager } from './PinManager.js';
import { ArduinoParser } from './ArduinoParser.js';

export class Engine {
    constructor() {
        this.pinManager = new PinManager();
        this.parser = new ArduinoParser(this.pinManager, this.handleSerial.bind(this));
        this.running = false;
        this.loopHandle = null;
        this.peripherals = new Map(); // id -> peripheral instance
        this.serialListeners = [];
        this.statusListeners = [];
        this.startTime = 0;
        this.speed = 1;
        this.serialBuffer = '';
    }

    /**
     * Register a peripheral
     */
    registerPeripheral(id, peripheral) {
        this.peripherals.set(id, peripheral);
        // Subscribe to pin changes for this peripheral
        if (peripheral.connectedPins) {
            for (const pin of peripheral.connectedPins) {
                this.pinManager.connectPin(pin, id, peripheral.type);
            }
        }
    }

    /**
     * Remove a peripheral
     */
    removePeripheral(id) {
        const peripheral = this.peripherals.get(id);
        if (peripheral && peripheral.connectedPins) {
            for (const pin of peripheral.connectedPins) {
                this.pinManager.disconnectPin(pin);
            }
        }
        this.peripherals.delete(id);
    }

    /**
     * Start simulation with code
     */
    async start(code) {
        if (this.running) return;

        this.running = true;
        this.parser.running = true;
        this.startTime = Date.now();
        this.parser.startTime = this.startTime;
        this.parser.speed = this.speed;
        this.notifyStatus('running');

        try {
            // Parse the code
            this.parser.parse(code);

            // Execute setup()
            await this.parser.execute(this.parser.setupCode);

            // Execute loop() repeatedly
            while (this.running) {
                await this.parser.execute(this.parser.loopCode);
                // Small yield to prevent browser freezing
                await new Promise(r => setTimeout(r, 1));
            }
        } catch (err) {
            this.handleSerial(`[Error] ${err.message}`, 'error');
            this.notifyStatus('error');
        }

        if (!this.running) {
            this.notifyStatus('stopped');
        }
    }

    /**
     * Stop simulation
     */
    stop() {
        this.running = false;
        this.parser.running = false;
        this.notifyStatus('stopped');
    }

    /**
     * Reset simulation state
     */
    reset() {
        this.stop();
        this.pinManager.reset();
        this.parser.variables = {};
        this.serialBuffer = '';
        this.notifyStatus('idle');
        // Reset peripherals
        for (const [, peripheral] of this.peripherals) {
            if (peripheral.reset) peripheral.reset();
        }
    }

    /**
     * Set simulation speed
     */
    setSpeed(speed) {
        this.speed = speed;
        this.parser.setSpeed(speed);
    }

    /**
     * Handle serial output from the parser
     */
    handleSerial(text, type) {
        if (type === 'print') {
            this.serialBuffer += text;
            return;
        }

        let output = this.serialBuffer + text;
        this.serialBuffer = '';

        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(3);

        for (const listener of this.serialListeners) {
            listener(output, type, elapsed);
        }
    }

    /**
     * Subscribe to serial output
     */
    onSerial(callback) {
        this.serialListeners.push(callback);
    }

    /**
     * Subscribe to status changes
     */
    onStatus(callback) {
        this.statusListeners.push(callback);
    }

    notifyStatus(status) {
        for (const cb of this.statusListeners) {
            cb(status);
        }
    }

    /**
     * Get elapsed simulation time
     */
    getElapsedTime() {
        if (!this.startTime) return 0;
        return ((Date.now() - this.startTime) * this.speed) / 1000;
    }

    /**
     * Get current code from the editor (set externally)
     */
    getCode() {
        return this._currentCode || '';
    }

    setCode(code) {
        this._currentCode = code;
    }

    /**
     * Export circuit as JSON
     */
    exportCircuit(components, wires) {
        return JSON.stringify({
            version: 1,
            editor: 'esp32-simulator',
            parts: components.map(c => ({
                type: c.type,
                id: c.id,
                attrs: c.attrs || {},
                position: c.position,
            })),
            connections: wires.map(w => ({
                from: w.from,
                to: w.to,
                color: w.color,
            })),
        }, null, 2);
    }

    /**
     * Import circuit from JSON
     */
    importCircuit(json) {
        try {
            return JSON.parse(json);
        } catch (e) {
            this.handleSerial(`[Error] Invalid circuit file: ${e.message}`, 'error');
            return null;
        }
    }
}
