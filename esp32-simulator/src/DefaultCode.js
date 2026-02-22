/**
 * Default Arduino code for the editor
 */
export const DEFAULT_CODE = `// ESP32 Blink + Serial Example
// This code blinks an LED and prints to Serial

#define LED_PIN 2
#define BUTTON_PIN 4

int counter = 0;
bool ledState = false;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  
  Serial.println("ESP32 Simulator Ready!");
  Serial.println("======================");
  Serial.println("LED on GPIO 2 will blink.");
  Serial.println("");
}

void loop() {
  // Toggle LED
  ledState = !ledState;
  digitalWrite(LED_PIN, ledState);
  
  // Read button (simulated)
  int btnState = digitalRead(BUTTON_PIN);
  
  // Print status
  counter++;
  Serial.print("Loop #");
  Serial.print(counter);
  Serial.print(" | LED: ");
  Serial.print(ledState ? "ON" : "OFF");
  Serial.print(" | Button: ");
  Serial.println(btnState ? "Released" : "Pressed");
  
  // Analog reading from potentiometer (GPIO 34)
  int potValue = analogRead(34);
  if (counter % 5 == 0) {
    Serial.print("  Potentiometer: ");
    Serial.print(potValue);
    Serial.print(" (");
    int percent = map(potValue, 0, 4095, 0, 100);
    Serial.print(percent);
    Serial.println("%)");
  }
  
  delay(1000);
}
`;
