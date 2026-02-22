/**
 * ESP32 Simulator — Main Application
 * Wires up all components: board, editor, serial monitor, component palette
 */
import { Engine } from './simulator/Engine.js';
import { COMPONENT_CATEGORIES, getComponentDef } from './components/ComponentDefinitions.js';
import { createBoard, getAllPins } from './components/Board.js';
import { DEFAULT_CODE } from './DefaultCode.js';
import * as monaco from 'monaco-editor';

// ============================================================
//  GLOBALS
// ============================================================
const engine = new Engine();
let editor = null;
let isRunning = false;
let placedComponents = [];
let wires = [];
let nextComponentId = 1;
let wiringMode = false;
let wireStart = null;
let timeInterval = null;

// ============================================================
//  INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initBoard();
    initComponentPalette();
    initEditor();
    initSerialMonitor();
    initToolbar();
    initToastContainer();

    showToast('ESP32 Simulator ready! Write code and click Run ▶', 'info');
});

// ============================================================
//  ESP32 BOARD
// ============================================================
function initBoard() {
    const container = document.getElementById('board-container');
    const board = createBoard();
    container.appendChild(board);

    // Add pin click handlers for wiring
    board.querySelectorAll('.esp32-pin').forEach(pinEl => {
        pinEl.addEventListener('click', (e) => {
            const pin = pinEl.dataset.pin;
            handlePinClick('board', pin, pinEl);
        });
    });

    // Pin state updates
    engine.pinManager.onChange((pin, state) => {
        const pinEl = document.getElementById(`board-pin-${pin}`);
        if (pinEl) {
            pinEl.classList.toggle('high', state.value === 1);
            pinEl.classList.toggle('active', state.mode === 'OUTPUT');
        }
        updatePeripheralVisuals(pin, state);
    });
}

// ============================================================
//  COMPONENT PALETTE
// ============================================================
function initComponentPalette() {
    const listEl = document.getElementById('component-list');
    const searchInput = document.getElementById('component-search');

    function renderList(filter = '') {
        listEl.innerHTML = '';
        for (const category of COMPONENT_CATEGORIES) {
            const filtered = category.components.filter(c =>
                c.name.toLowerCase().includes(filter.toLowerCase()) ||
                c.description.toLowerCase().includes(filter.toLowerCase())
            );
            if (filtered.length === 0) continue;

            const catHeader = document.createElement('div');
            catHeader.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);padding:12px 12px 4px;';
            catHeader.textContent = category.name;
            listEl.appendChild(catHeader);

            for (const comp of filtered) {
                const item = document.createElement('div');
                item.className = 'component-item animate-in';
                item.draggable = true;
                item.dataset.type = comp.type;
                item.innerHTML = `
          <div class="component-icon" style="background:${comp.color}22;color:${comp.color}">${comp.icon}</div>
          <div class="component-info">
            <div class="component-name">${comp.name}</div>
            <div class="component-desc">${comp.description}</div>
          </div>
        `;

                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('componentType', comp.type);
                    e.dataTransfer.effectAllowed = 'copy';
                });

                item.addEventListener('click', () => {
                    addComponentToCanvas(comp.type);
                });

                listEl.appendChild(item);
            }
        }
    }

    renderList();

    searchInput.addEventListener('input', (e) => {
        renderList(e.target.value);
    });

    // Canvas drop zone
    const canvas = document.getElementById('circuit-canvas');
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('componentType');
        if (type) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            addComponentToCanvas(type, x, y);
        }
    });
}

// ============================================================
//  ADD COMPONENT TO CANVAS
// ============================================================
function addComponentToCanvas(type, x = null, y = null) {
    const def = getComponentDef(type);
    if (!def) return;

    const id = `${type}-${nextComponentId++}`;
    const canvas = document.getElementById('circuit-canvas');
    const rect = canvas.getBoundingClientRect();

    if (x === null) {
        // Place to the right of the board
        x = rect.width / 2 + 200;
        y = 80 + placedComponents.length * 100;
    }

    const comp = {
        id,
        type,
        def,
        position: { x, y },
        attrs: { ...(def.defaultAttrs || {}) },
        element: null,
    };

    // Create visual element
    const wrapper = document.createElement('div');
    wrapper.className = 'placed-component animate-in';
    wrapper.id = `comp-${id}`;
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;

    wrapper.innerHTML = `
    <button class="delete-btn" title="Remove">✕</button>
    <div class="comp-visual" id="visual-${id}">
      ${renderComponentVisual(type, id, comp.attrs)}
    </div>
    ${renderComponentPins(def, id)}
    ${def.controls ? renderComponentControls(def, id, comp.attrs) : ''}
  `;

    comp.element = wrapper;

    // Delete button
    wrapper.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeComponent(id);
    });

    // Drag to move
    makeDraggable(wrapper, comp);

    // Pin click handlers
    wrapper.querySelectorAll('.pin-indicator').forEach(pinEl => {
        pinEl.addEventListener('click', (e) => {
            e.stopPropagation();
            handlePinClick(id, pinEl.dataset.pin, pinEl);
        });
    });

    // Control handlers
    if (def.controls) {
        setupComponentControls(wrapper, id, comp);
    }

    // Selection
    wrapper.addEventListener('click', (e) => {
        document.querySelectorAll('.placed-component.selected').forEach(el => el.classList.remove('selected'));
        wrapper.classList.add('selected');
    });

    document.getElementById('placed-components').appendChild(wrapper);
    placedComponents.push(comp);
    updateComponentCount();

    showToast(`Added ${def.name}`, 'success');
}

// ============================================================
//  COMPONENT VISUALS
// ============================================================
function renderComponentVisual(type, id, attrs) {
    switch (type) {
        case 'led':
            const color = attrs.color || 'red';
            const colorMap = {
                red: '#ef4444', green: '#10b981', blue: '#3b82f6',
                yellow: '#fbbf24', white: '#f1f5f9', orange: '#f97316',
            };
            return `
        <div class="led-visual" id="led-${id}" style="
          width: 24px; height: 24px; border-radius: 50%;
          background: ${colorMap[color] || '#ef4444'}44;
          border: 2px solid ${colorMap[color] || '#ef4444'}88;
          transition: all 0.2s;
          margin: 8px auto;
        "></div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px;">LED (${color})</div>
      `;

        case 'rgb-led':
            return `
        <div class="led-visual" id="led-${id}" style="
          width: 28px; height: 28px; border-radius: 50%;
          background: #33333344;
          border: 2px solid #55555588;
          transition: all 0.2s;
          margin: 8px auto;
        "></div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px;">RGB LED</div>
      `;

        case 'dht22':
            return `
        <div style="
          padding: 8px 12px; border-radius: 6px;
          background: linear-gradient(135deg, #1a4a3a, #0d2d22);
          border: 1px solid #10b98144;
          text-align: center; min-width: 100px;
        ">
          <div style="font-size:11px;font-weight:600;color:#10b981;margin-bottom:6px;">DHT22</div>
          <div style="font-family:var(--font-mono);font-size:12px;color:#10b981;" id="dht-temp-${id}">${attrs.temperature || 23.5}°C</div>
          <div style="font-family:var(--font-mono);font-size:12px;color:#4cc9f0;" id="dht-hum-${id}">${attrs.humidity || 45.8}%</div>
        </div>
      `;

        case 'lcd1602':
            return `
        <div style="
          padding: 8px; border-radius: 4px;
          background: #1a365d; border: 2px solid #2563eb44;
          min-width: 160px;
        ">
          <div style="
            background: #0c4a6e; padding: 6px 8px; border-radius: 3px;
            font-family: var(--font-mono); font-size: 13px;
            color: #7dd3fc; min-height: 36px; line-height: 1.4;
          " id="lcd-${id}">Hello, World!<br>ESP32 Sim v1.0</div>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px;">LCD 16×2</div>
      `;

        case 'buzzer':
            return `
        <div style="
          width: 36px; height: 36px; border-radius: 50%;
          background: #1f2937; border: 2px solid #fbbf2444;
          display: flex; align-items: center; justify-content: center;
          margin: 4px auto; font-size: 16px;
        " id="buzzer-${id}">🔇</div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px;">Buzzer</div>
      `;

        case 'servo':
            return `
        <div style="
          padding: 8px 12px; border-radius: 6px;
          background: linear-gradient(135deg, #2d1f5e, #1a1145);
          border: 1px solid #8b5cf644; text-align: center;
        ">
          <div style="font-size:11px;font-weight:600;color:#8b5cf6;margin-bottom:4px;">SERVO</div>
          <div style="font-family:var(--font-mono);font-size:14px;color:#c4b5fd;" id="servo-angle-${id}">${attrs.angle || 90}°</div>
          <div style="width:40px;height:3px;background:#8b5cf6;margin:6px auto;border-radius:2px;transform:rotate(${(attrs.angle || 90) - 90}deg);transition:transform 0.3s;" id="servo-arm-${id}"></div>
        </div>
      `;

        case 'pushbutton':
            return `
        <div style="
          width: 32px; height: 32px; border-radius: 4px;
          background: #374151; border: 2px solid #6b728066;
          display: flex; align-items: center; justify-content: center;
          margin: 4px auto; cursor: pointer; transition: all 0.1s;
          user-select: none;
        " id="button-${id}" onmousedown="this.style.transform='scale(0.9)';this.style.background='#4b5563'" onmouseup="this.style.transform='scale(1)';this.style.background='#374151'">
          <div style="width:16px;height:16px;border-radius:50%;background:#555;"></div>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px;">Button</div>
      `;

        case 'potentiometer':
            return `
        <div style="
          width: 40px; height: 40px; border-radius: 50%;
          background: #1e293b; border: 2px solid #06b6d444;
          display: flex; align-items: center; justify-content: center;
          margin: 4px auto;
        ">
          <div style="width:2px;height:16px;background:#06b6d4;transform:rotate(${(attrs.value || 50) * 2.7 - 135}deg);transition:transform 0.2s;" id="pot-needle-${id}"></div>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px;">POT: <span id="pot-val-${id}">${attrs.value || 50}%</span></div>
      `;

        case 'photoresistor':
            return `
        <div style="
          width: 30px; height: 30px; border-radius: 50%;
          background: #78350f; border: 2px solid #fbbf2444;
          display: flex; align-items: center; justify-content: center;
          margin: 4px auto; font-size: 16px;
        ">☀️</div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px;">LDR: <span id="ldr-val-${id}">${attrs.light || 50}%</span></div>
      `;

        case 'pir':
            return `
        <div style="
          width: 36px; height: 36px; border-radius: 50%;
          background: #1f2937; border: 2px solid #ef444444;
          display: flex; align-items: center; justify-content: center;
          margin: 4px auto; font-size: 16px;
        " id="pir-${id}">👁️</div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px;">PIR Sensor</div>
      `;

        case 'resistor':
            return `
        <div style="
          display: flex; align-items: center; gap: 4px;
          padding: 4px;
        ">
          <div style="width:8px;height:2px;background:#94a3b8;"></div>
          <div style="
            width: 40px; height: 14px; border-radius: 3px;
            background: linear-gradient(90deg, #b45309, #f59e0b, #b45309, #b45309);
          "></div>
          <div style="width:8px;height:2px;background:#94a3b8;"></div>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:2px;">${attrs.resistance || 220}Ω</div>
      `;

        default:
            return `<div style="padding:8px;color:var(--text-muted);font-size:12px;">${type}</div>`;
    }
}

function renderComponentPins(def, id) {
    if (!def.pins) return '';
    const pinCount = def.pins.length;
    return def.pins.map((pin, i) => {
        const top = 10 + (i / Math.max(pinCount - 1, 1)) * 60;
        const side = pin.side === 'right' ? 'right: -5px;' : 'left: -5px;';
        return `<div class="pin-indicator" data-pin="${pin.name}" data-comp="${id}"
      style="${side} top: ${top}%;"
      title="${pin.label}"></div>`;
    }).join('');
}

function renderComponentControls(def, id, attrs) {
    if (!def.controls || def.controls.length === 0) return '';
    let html = '<div class="component-controls">';
    for (const ctrl of def.controls) {
        if (ctrl.type === 'slider') {
            html += `
        <label>${ctrl.label}</label>
        <input type="range" data-prop="${ctrl.prop}" data-comp="${id}"
          min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step || 1}"
          value="${attrs[ctrl.prop] || 0}" class="ctrl-slider" />
        <span class="ctrl-value" id="ctrl-${id}-${ctrl.prop}">${attrs[ctrl.prop] || 0}${ctrl.unit || ''}</span>
      `;
        } else if (ctrl.type === 'select') {
            html += `
        <label>${ctrl.label}</label>
        <select data-prop="${ctrl.prop}" data-comp="${id}" class="ctrl-select" style="
          background: var(--bg-secondary); border: 1px solid var(--border-color);
          border-radius: 3px; color: var(--text-primary); font-size: 10px; padding: 2px 4px;
        ">
          ${ctrl.options.map(o => `<option value="${o}" ${attrs[ctrl.prop] == o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      `;
        } else if (ctrl.type === 'toggle') {
            html += `
        <label>${ctrl.label}</label>
        <button class="ctrl-toggle serial-btn" data-prop="${ctrl.prop}" data-comp="${id}"
          style="font-size:10px;">${attrs[ctrl.prop] ? 'ON' : 'OFF'}</button>
      `;
        }
    }
    html += '</div>';
    return html;
}

function setupComponentControls(wrapper, id, comp) {
    // Sliders
    wrapper.querySelectorAll('.ctrl-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const prop = e.target.dataset.prop;
            const val = parseFloat(e.target.value);
            comp.attrs[prop] = val;
            const label = document.getElementById(`ctrl-${id}-${prop}`);
            const ctrl = comp.def.controls.find(c => c.prop === prop);
            if (label) label.textContent = val + (ctrl?.unit || '');
            updateComponentAttr(id, prop, val);
        });
    });

    // Selects
    wrapper.querySelectorAll('.ctrl-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const prop = e.target.dataset.prop;
            comp.attrs[prop] = e.target.value;
            updateComponentAttr(id, prop, e.target.value);
        });
    });

    // Toggles
    wrapper.querySelectorAll('.ctrl-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const prop = e.target.dataset.prop;
            comp.attrs[prop] = !comp.attrs[prop];
            e.target.textContent = comp.attrs[prop] ? 'ON' : 'OFF';
            updateComponentAttr(id, prop, comp.attrs[prop]);
        });
    });
}

function updateComponentAttr(id, prop, value) {
    const comp = placedComponents.find(c => c.id === id);
    if (!comp) return;

    // Update visual based on attribute
    if (comp.type === 'dht22') {
        if (prop === 'temperature') {
            const el = document.getElementById(`dht-temp-${id}`);
            if (el) el.textContent = `${value}°C`;
        }
        if (prop === 'humidity') {
            const el = document.getElementById(`dht-hum-${id}`);
            if (el) el.textContent = `${value}%`;
        }
    } else if (comp.type === 'potentiometer') {
        const needle = document.getElementById(`pot-needle-${id}`);
        const valLabel = document.getElementById(`pot-val-${id}`);
        if (needle) needle.style.transform = `rotate(${value * 2.7 - 135}deg)`;
        if (valLabel) valLabel.textContent = `${value}%`;
        // Update analog value on connected pin
        updateAnalogValue(id, Math.round(value / 100 * 4095));
    } else if (comp.type === 'photoresistor') {
        const valLabel = document.getElementById(`ldr-val-${id}`);
        if (valLabel) valLabel.textContent = `${value}%`;
        updateAnalogValue(id, Math.round(value / 100 * 4095));
    } else if (comp.type === 'pir') {
        const pirEl = document.getElementById(`pir-${id}`);
        if (pirEl) pirEl.style.borderColor = value ? '#ef4444' : '#ef444444';
    } else if (comp.type === 'led' && prop === 'color') {
        // Re-render the visual
        const visual = document.getElementById(`visual-${id}`);
        if (visual) {
            comp.attrs.color = value;
            visual.innerHTML = renderComponentVisual('led', id, comp.attrs);
        }
    }
}

function updateAnalogValue(compId, value) {
    // Find wire connected to this component and update the pin
    for (const wire of wires) {
        if (wire.from.compId === compId || wire.to.compId === compId) {
            const boardPin = wire.from.compId === 'board' ? wire.from.pin : wire.to.pin;
            engine.pinManager.setAnalogValue(boardPin, value);
        }
    }
}

// ============================================================
//  PERIPHERAL VISUAL UPDATES
// ============================================================
function updatePeripheralVisuals(pin, state) {
    // Find components connected to this pin via wires
    for (const wire of wires) {
        let compId = null;
        if (wire.from.compId === 'board' && String(wire.from.pin) === String(pin)) {
            compId = wire.to.compId;
        } else if (wire.to.compId === 'board' && String(wire.to.pin) === String(pin)) {
            compId = wire.from.compId;
        }
        if (!compId) continue;

        const comp = placedComponents.find(c => c.id === compId);
        if (!comp) continue;

        // LED
        if (comp.type === 'led') {
            const led = document.getElementById(`led-${compId}`);
            if (led) {
                const colorMap = {
                    red: '#ef4444', green: '#10b981', blue: '#3b82f6',
                    yellow: '#fbbf24', white: '#f1f5f9', orange: '#f97316',
                };
                const c = colorMap[comp.attrs.color] || '#ef4444';
                if (state.value) {
                    led.style.background = c;
                    led.style.boxShadow = `0 0 16px ${c}, 0 0 32px ${c}66`;
                    led.classList.add('led-glow');
                } else {
                    led.style.background = `${c}44`;
                    led.style.boxShadow = 'none';
                    led.classList.remove('led-glow');
                }
            }
        }

        // Buzzer
        if (comp.type === 'buzzer') {
            const buz = document.getElementById(`buzzer-${compId}`);
            if (buz) {
                buz.textContent = state.value ? '🔔' : '🔇';
                buz.style.borderColor = state.value ? '#fbbf24' : '#fbbf2444';
            }
        }

        // Servo
        if (comp.type === 'servo' && state.pwmValue !== undefined) {
            const angle = Math.round(state.pwmValue / 255 * 180);
            const angleEl = document.getElementById(`servo-angle-${compId}`);
            const armEl = document.getElementById(`servo-arm-${compId}`);
            if (angleEl) angleEl.textContent = `${angle}°`;
            if (armEl) armEl.style.transform = `rotate(${angle - 90}deg)`;
        }
    }
}

// ============================================================
//  DRAGGABLE COMPONENTS
// ============================================================
function makeDraggable(element, comp) {
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    element.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('delete-btn') ||
            e.target.classList.contains('pin-indicator') ||
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'SELECT' ||
            e.target.tagName === 'BUTTON') return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origLeft = parseInt(element.style.left) || 0;
        origTop = parseInt(element.style.top) || 0;
        element.style.zIndex = '20';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = origLeft + dx;
        const newTop = origTop + dy;
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
        comp.position = { x: newLeft, y: newTop };
        updateWires();
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            element.style.zIndex = '';
        }
    });
}

// ============================================================
//  WIRING
// ============================================================
const WIRE_COLORS = ['wire-red', 'wire-green', 'wire-blue', 'wire-yellow', 'wire-orange', 'wire-purple', 'wire-white'];
let wireColorIdx = 0;

function handlePinClick(compId, pin, pinEl) {
    if (!wireStart) {
        // Start wire
        wireStart = { compId, pin, element: pinEl };
        pinEl.classList.add('connected');
        pinEl.style.transform = 'scale(1.8)';
        pinEl.style.background = 'var(--accent-cyan)';
        showToast('Click another pin to connect wire', 'info');
    } else {
        // End wire — don't connect to same component
        if (wireStart.compId === compId) {
            wireStart.element.style.transform = '';
            wireStart.element.style.background = '';
            wireStart = null;
            return;
        }

        const wireColor = WIRE_COLORS[wireColorIdx % WIRE_COLORS.length];
        wireColorIdx++;

        const wire = {
            id: `wire-${wires.length}`,
            from: { compId: wireStart.compId, pin: wireStart.pin },
            to: { compId, pin },
            color: wireColor,
        };

        wires.push(wire);
        wireStart.element.classList.add('connected');
        pinEl.classList.add('connected');

        // Reset
        wireStart.element.style.transform = '';
        wireStart.element.style.background = '';
        wireStart = null;

        updateWires();
        showToast('Wire connected!', 'success');
    }
}

function updateWires() {
    const svg = document.getElementById('wire-svg');
    svg.innerHTML = '';

    for (const wire of wires) {
        const from = getAbsolutePinPosition(wire.from.compId, wire.from.pin);
        const to = getAbsolutePinPosition(wire.to.compId, wire.to.pin);
        if (!from || !to) continue;

        // Create curved path
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const dx = Math.abs(to.x - from.x);
        const controlOffset = Math.min(dx * 0.4, 80);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d',
            `M ${from.x} ${from.y} C ${from.x + controlOffset} ${from.y}, ${to.x - controlOffset} ${to.y}, ${to.x} ${to.y}`
        );
        path.setAttribute('class', `wire ${wire.color}`);
        path.addEventListener('dblclick', () => {
            removeWire(wire.id);
        });
        svg.appendChild(path);
    }
}

function getAbsolutePinPosition(compId, pinName) {
    const canvas = document.getElementById('circuit-canvas');
    const canvasRect = canvas.getBoundingClientRect();

    if (compId === 'board') {
        const pinEl = document.getElementById(`board-pin-${pinName}`);
        if (!pinEl) return null;
        const rect = pinEl.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2 - canvasRect.left,
            y: rect.top + rect.height / 2 - canvasRect.top,
        };
    }

    const wrapper = document.getElementById(`comp-${compId}`);
    if (!wrapper) return null;
    const pinEl = wrapper.querySelector(`[data-pin="${pinName}"]`);
    if (!pinEl) return null;
    const rect = pinEl.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2 - canvasRect.left,
        y: rect.top + rect.height / 2 - canvasRect.top,
    };
}

function removeWire(wireId) {
    wires = wires.filter(w => w.id !== wireId);
    updateWires();
    showToast('Wire removed', 'info');
}

// ============================================================
//  REMOVE COMPONENT
// ============================================================
function removeComponent(id) {
    // Remove wires connected to this component
    wires = wires.filter(w => w.from.compId !== id && w.to.compId !== id);
    updateWires();

    // Remove element
    const el = document.getElementById(`comp-${id}`);
    if (el) el.remove();

    placedComponents = placedComponents.filter(c => c.id !== id);
    engine.removePeripheral(id);
    updateComponentCount();
}

function updateComponentCount() {
    const counter = document.getElementById('component-count');
    counter.textContent = `${placedComponents.length} component${placedComponents.length !== 1 ? 's' : ''}`;
}

// ============================================================
//  CODE EDITOR (Monaco)
// ============================================================
function initEditor() {
    // Configure Monaco for Arduino/C++
    self.MonacoEnvironment = {
        getWorker: function () {
            return new Worker(
                new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
                { type: 'module' }
            );
        }
    };

    editor = monaco.editor.create(document.getElementById('code-editor'), {
        value: DEFAULT_CODE,
        language: 'cpp',
        theme: 'vs-dark',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderLineHighlight: 'gutter',
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'off',
        padding: { top: 12 },
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        bracketPairColorization: { enabled: true },
        guides: {
            bracketPairs: true,
            indentation: true,
        },
    });

    // Custom theme
    monaco.editor.defineTheme('esp32-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
            { token: 'keyword', foreground: '7b61ff' },
            { token: 'string', foreground: '10b981' },
            { token: 'number', foreground: 'fbbf24' },
            { token: 'type', foreground: '4cc9f0' },
        ],
        colors: {
            'editor.background': '#0d1117',
            'editor.foreground': '#e2e8f0',
            'editorCursor.foreground': '#00f5d4',
            'editor.lineHighlightBackground': '#111827',
            'editor.selectionBackground': '#7b61ff33',
            'editorLineNumber.foreground': '#374151',
            'editorLineNumber.activeForeground': '#00f5d4',
        },
    });
    monaco.editor.setTheme('esp32-dark');

    // Register Arduino-specific auto-completions
    monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems: (model, position) => {
            const suggestions = [
                'pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite',
                'Serial.begin', 'Serial.print', 'Serial.println', 'Serial.printf',
                'delay', 'delayMicroseconds', 'millis', 'micros',
                'map', 'constrain', 'random', 'abs', 'min', 'max', 'pow', 'sqrt',
                'tone', 'noTone', 'ledcWrite',
                'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP',
                'void setup()', 'void loop()',
            ].map(label => ({
                label,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: label,
                range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                },
            }));
            return { suggestions };
        },
    });
}

// ============================================================
//  SERIAL MONITOR
// ============================================================
function initSerialMonitor() {
    const output = document.getElementById('serial-output');
    const clearBtn = document.getElementById('btn-clear-serial');
    const sendBtn = document.getElementById('btn-serial-send');
    const input = document.getElementById('serial-input');
    const autoscroll = document.getElementById('serial-autoscroll');

    engine.onSerial((text, type, elapsed) => {
        const line = document.createElement('div');
        line.className = `serial-line ${type === 'error' ? 'error' : ''} ${type === 'system' ? 'system' : ''}`;

        const timestamp = document.createElement('span');
        timestamp.className = 'serial-timestamp';
        timestamp.textContent = `[${elapsed}s]`;

        line.appendChild(timestamp);
        line.appendChild(document.createTextNode(text));
        output.appendChild(line);

        if (autoscroll.checked) {
            output.scrollTop = output.scrollHeight;
        }
    });

    clearBtn.addEventListener('click', () => {
        output.innerHTML = '';
    });

    sendBtn.addEventListener('click', () => {
        if (input.value.trim()) {
            // TODO: Send to Serial input buffer
            showToast(`Sent: "${input.value}"`, 'info');
            input.value = '';
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendBtn.click();
    });
}

// ============================================================
//  TOOLBAR
// ============================================================
function initToolbar() {
    const btnRun = document.getElementById('btn-run');
    const btnStop = document.getElementById('btn-stop');
    const btnReset = document.getElementById('btn-reset');
    const btnSave = document.getElementById('btn-save');
    const btnLoad = document.getElementById('btn-load');
    const speedSlider = document.getElementById('speed-slider');
    const speedLabel = document.getElementById('speed-label');
    const statusEl = document.getElementById('status-indicator');
    const timeEl = document.getElementById('sim-time');

    // Tab switching
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // Run
    btnRun.addEventListener('click', () => {
        if (isRunning) return;
        isRunning = true;
        btnRun.disabled = true;
        btnStop.disabled = false;

        const code = editor.getValue();
        engine.start(code);

        // Start time counter
        timeInterval = setInterval(() => {
            const t = engine.getElapsedTime();
            timeEl.textContent = `${t.toFixed(2)}s`;
        }, 100);
    });

    // Stop
    btnStop.addEventListener('click', () => {
        isRunning = false;
        btnRun.disabled = false;
        btnStop.disabled = true;
        engine.stop();
        if (timeInterval) {
            clearInterval(timeInterval);
            timeInterval = null;
        }
    });

    // Reset
    btnReset.addEventListener('click', () => {
        isRunning = false;
        btnRun.disabled = false;
        btnStop.disabled = true;
        engine.reset();
        document.getElementById('serial-output').innerHTML = '';
        const timeEl = document.getElementById('sim-time');
        timeEl.textContent = '0.00s';
        if (timeInterval) {
            clearInterval(timeInterval);
            timeInterval = null;
        }
        showToast('Simulation reset', 'info');
    });

    // Speed
    speedSlider.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        speedLabel.textContent = `${speed}×`;
        engine.setSpeed(speed);
    });

    // Status listener
    engine.onStatus((status) => {
        statusEl.className = `status-${status}`;
        const statusText = {
            idle: '⬤ Idle',
            running: '⬤ Running',
            stopped: '⬤ Stopped',
            error: '⬤ Error',
        };
        statusEl.textContent = statusText[status] || status;
    });

    // Save
    btnSave.addEventListener('click', () => {
        const circuit = engine.exportCircuit(placedComponents, wires);
        const blob = new Blob([circuit], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'esp32-circuit.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Circuit saved!', 'success');
    });

    // Load
    btnLoad.addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const data = engine.importCircuit(ev.target.result);
            if (data) {
                // Clear existing
                placedComponents.forEach(c => removeComponent(c.id));
                // Load components
                if (data.parts) {
                    for (const part of data.parts) {
                        addComponentToCanvas(part.type, part.position?.x, part.position?.y);
                    }
                }
                showToast('Circuit loaded!', 'success');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
}

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================
function initToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toast-container';
    document.body.appendChild(container);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
