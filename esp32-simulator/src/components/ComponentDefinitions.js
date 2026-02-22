/**
 * Component Definitions — defines all available electronic components
 */

export const COMPONENT_CATEGORIES = [
    {
        name: 'Output',
        components: [
            {
                type: 'led',
                name: 'LED',
                description: 'Light Emitting Diode',
                icon: '💡',
                color: '#10b981',
                pins: [
                    { name: 'anode', label: 'A (+)', side: 'left' },
                    { name: 'cathode', label: 'K (-)', side: 'right' },
                ],
                defaultAttrs: { color: 'red' },
                controls: [
                    { type: 'select', prop: 'color', label: 'Color', options: ['red', 'green', 'blue', 'yellow', 'white', 'orange'] },
                ],
            },
            {
                type: 'rgb-led',
                name: 'RGB LED',
                description: 'Common cathode RGB LED',
                icon: '🔴',
                color: '#f72585',
                pins: [
                    { name: 'red', label: 'R' },
                    { name: 'cathode', label: 'GND' },
                    { name: 'green', label: 'G' },
                    { name: 'blue', label: 'B' },
                ],
                defaultAttrs: {},
            },
            {
                type: 'lcd1602',
                name: 'LCD 16×2',
                description: 'Character LCD display',
                icon: '📟',
                color: '#4cc9f0',
                pins: [
                    { name: 'SDA', label: 'SDA' },
                    { name: 'SCL', label: 'SCL' },
                    { name: 'VCC', label: 'VCC' },
                    { name: 'GND', label: 'GND' },
                ],
                defaultAttrs: {},
            },
            {
                type: 'buzzer',
                name: 'Piezo Buzzer',
                description: 'Sound output',
                icon: '🔊',
                color: '#fbbf24',
                pins: [
                    { name: 'signal', label: 'SIG' },
                    { name: 'gnd', label: 'GND' },
                ],
                defaultAttrs: {},
            },
            {
                type: 'servo',
                name: 'Servo Motor',
                description: 'SG90 micro servo',
                icon: '⚙️',
                color: '#8b5cf6',
                pins: [
                    { name: 'signal', label: 'SIG' },
                    { name: 'vcc', label: 'VCC' },
                    { name: 'gnd', label: 'GND' },
                ],
                defaultAttrs: { angle: 90 },
            },
        ],
    },
    {
        name: 'Input',
        components: [
            {
                type: 'pushbutton',
                name: 'Push Button',
                description: 'Momentary switch',
                icon: '🔘',
                color: '#64748b',
                pins: [
                    { name: 'a', label: '1' },
                    { name: 'b', label: '2' },
                ],
                defaultAttrs: {},
            },
            {
                type: 'potentiometer',
                name: 'Potentiometer',
                description: 'Variable resistor',
                icon: '🎛️',
                color: '#06b6d4',
                pins: [
                    { name: 'vcc', label: 'VCC' },
                    { name: 'signal', label: 'SIG' },
                    { name: 'gnd', label: 'GND' },
                ],
                defaultAttrs: { value: 50 },
                controls: [
                    { type: 'slider', prop: 'value', label: 'Position', min: 0, max: 100, unit: '%' },
                ],
            },
            {
                type: 'photoresistor',
                name: 'Photoresistor',
                description: 'Light sensor (LDR)',
                icon: '☀️',
                color: '#fbbf24',
                pins: [
                    { name: 'a', label: '1' },
                    { name: 'b', label: '2' },
                ],
                defaultAttrs: { light: 50 },
                controls: [
                    { type: 'slider', prop: 'light', label: 'Light', min: 0, max: 100, unit: '%' },
                ],
            },
        ],
    },
    {
        name: 'Sensors',
        components: [
            {
                type: 'dht22',
                name: 'DHT22',
                description: 'Temperature & Humidity',
                icon: '🌡️',
                color: '#10b981',
                pins: [
                    { name: 'VCC', label: 'VCC' },
                    { name: 'SDA', label: 'DATA' },
                    { name: 'NC', label: 'NC' },
                    { name: 'GND', label: 'GND' },
                ],
                defaultAttrs: { temperature: 23.5, humidity: 45.8 },
                controls: [
                    { type: 'slider', prop: 'temperature', label: 'Temp', min: -40, max: 80, step: 0.5, unit: '°C' },
                    { type: 'slider', prop: 'humidity', label: 'Humidity', min: 0, max: 100, step: 0.1, unit: '%' },
                ],
            },
            {
                type: 'pir',
                name: 'PIR Sensor',
                description: 'Motion detector',
                icon: '👁️',
                color: '#ef4444',
                pins: [
                    { name: 'vcc', label: 'VCC' },
                    { name: 'signal', label: 'OUT' },
                    { name: 'gnd', label: 'GND' },
                ],
                defaultAttrs: { motion: false },
                controls: [
                    { type: 'toggle', prop: 'motion', label: 'Motion' },
                ],
            },
        ],
    },
    {
        name: 'Passive',
        components: [
            {
                type: 'resistor',
                name: 'Resistor',
                description: 'Fixed resistor',
                icon: '〰️',
                color: '#94a3b8',
                pins: [
                    { name: 'a', label: '1' },
                    { name: 'b', label: '2' },
                ],
                defaultAttrs: { resistance: 220 },
                controls: [
                    { type: 'select', prop: 'resistance', label: 'Ω', options: [100, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000] },
                ],
            },
        ],
    },
];

/**
 * Get flat list of all components
 */
export function getAllComponents() {
    return COMPONENT_CATEGORIES.flatMap(cat => cat.components);
}

/**
 * Find component definition by type
 */
export function getComponentDef(type) {
    return getAllComponents().find(c => c.type === type);
}
