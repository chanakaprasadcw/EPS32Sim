/**
 * ESP32 Board — Renders the ESP32 DevKit board visual
 */

// ESP32 DevKit C V4 pin layout
const LEFT_PINS = [
    '3V3', 'EN', '36', '39', '34', '35', '32', '33', '25', '26', '27', '14', '12', 'GND', '13'
];

const RIGHT_PINS = [
    'VIN', 'GND', '23', '22', '1', '3', '21', '19', '18', '5', '17', '16', '4', '0', '2', '15'
];

export function createBoard() {
    const board = document.createElement('div');
    board.className = 'esp32-board';
    board.id = 'esp32-board';

    board.innerHTML = `
    <div class="esp32-board-title">ESP32 DevKit</div>
    <div class="esp32-board-subtitle">Xtensa® dual-core 240MHz</div>
    <div class="esp32-pins-container">
      <div class="esp32-pin-column" id="pins-left">
        ${LEFT_PINS.map(pin => `
          <div class="esp32-pin" data-pin="${pin}" id="board-pin-${pin}">
            <span class="esp32-pin-dot"></span>
            <span class="esp32-pin-label">${formatPinLabel(pin)}</span>
          </div>
        `).join('')}
      </div>
      <div class="esp32-pin-column" id="pins-right">
        ${RIGHT_PINS.map(pin => `
          <div class="esp32-pin" data-pin="${pin}" id="board-pin-${pin}">
            <span class="esp32-pin-label">${formatPinLabel(pin)}</span>
            <span class="esp32-pin-dot"></span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="esp32-usb"></div>
  `;

    return board;
}

function formatPinLabel(pin) {
    if (pin === '3V3') return '3V3';
    if (pin === 'GND') return 'GND';
    if (pin === 'VIN') return 'VIN';
    if (pin === 'EN') return 'EN';
    return `GPIO${pin}`;
}

export function getLeftPins() { return LEFT_PINS; }
export function getRightPins() { return RIGHT_PINS; }
export function getAllPins() { return [...LEFT_PINS, ...RIGHT_PINS]; }
