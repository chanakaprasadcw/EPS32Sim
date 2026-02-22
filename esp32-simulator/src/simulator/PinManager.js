/**
 * PinManager — Manages ESP32 GPIO pin states
 */
export class PinManager {
    constructor() {
        this.pins = {};
        this.listeners = [];
        this.initPins();
    }

    initPins() {
        // ESP32 GPIO pins
        const gpios = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];
        const adcPins = [32, 33, 34, 35, 36, 39, 25, 26, 27, 14, 12, 13, 4, 0, 2, 15];
        const dacPins = [25, 26];

        for (const pin of gpios) {
            this.pins[pin] = {
                number: pin,
                mode: 'INPUT',      // INPUT, OUTPUT, INPUT_PULLUP
                value: 0,            // 0 or 1 for digital, 0-4095 for analog
                analogValue: 0,      // For ADC reads
                pwmValue: 0,         // 0-255
                isADC: adcPins.includes(pin),
                isDAC: dacPins.includes(pin),
                connected: null,     // { componentId, pinName }
            };
        }

        // Special pins
        this.pins['3V3'] = { number: '3V3', mode: 'POWER', value: 1, connected: null };
        this.pins['GND'] = { number: 'GND', mode: 'POWER', value: 0, connected: null };
        this.pins['VIN'] = { number: 'VIN', mode: 'POWER', value: 1, connected: null };
    }

    pinMode(pin, mode) {
        if (this.pins[pin]) {
            this.pins[pin].mode = mode;
            this.notify(pin);
        }
    }

    digitalWrite(pin, value) {
        if (this.pins[pin]) {
            this.pins[pin].value = value ? 1 : 0;
            this.notify(pin);
        }
    }

    digitalRead(pin) {
        if (this.pins[pin]) {
            return this.pins[pin].value;
        }
        return 0;
    }

    analogRead(pin) {
        if (this.pins[pin]) {
            return this.pins[pin].analogValue || 0;
        }
        return 0;
    }

    analogWrite(pin, value) {
        if (this.pins[pin]) {
            this.pins[pin].pwmValue = Math.max(0, Math.min(255, value));
            this.pins[pin].value = value > 0 ? 1 : 0;
            this.notify(pin);
        }
    }

    setAnalogValue(pin, value) {
        if (this.pins[pin]) {
            this.pins[pin].analogValue = Math.max(0, Math.min(4095, value));
        }
    }

    connectPin(pin, componentId, pinName) {
        if (this.pins[pin]) {
            this.pins[pin].connected = { componentId, pinName };
        }
    }

    disconnectPin(pin) {
        if (this.pins[pin]) {
            this.pins[pin].connected = null;
        }
    }

    onChange(callback) {
        this.listeners.push(callback);
    }

    notify(pin) {
        for (const cb of this.listeners) {
            cb(pin, this.pins[pin]);
        }
    }

    reset() {
        this.initPins();
        for (const pin of Object.keys(this.pins)) {
            this.notify(pin);
        }
    }

    getState() {
        return { ...this.pins };
    }
}
