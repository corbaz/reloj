# Temporizador Retro Flip Countdown ⏱️

> Un reloj digital y temporizador de cuenta regresiva con tarjetas abatibles 3D (*split-flap*), basado en el **Patrón de Módulo en JavaScript**, sincronización internacional sub-segundo vía **SNTP** y soporte dinámico de múltiples zonas horarias.

![Licencia](https://img.shields.io/badge/licencia-MIT-blue.svg)
![Accesibilidad](https://img.shields.io/badge/WCAG-2.2%20AA-success.svg)
![Arquitectura](https://img.shields.io/badge/Arquitectura-Patrón%20de%20Módulo-yellow.svg)
![Versión](https://img.shields.io/badge/versión-v.26.0920.08.04-yellow.svg)

**Versión actual**: `v.26.0920.08.04` • **Producción**: [hora-web.surge.sh](https://hora-web.surge.sh)

---

## 🚀 Características Principales

- **Pantalla Mecánica 3D (*Split-Flap*)**: Animación realista de tarjetas abatibles mediante transformaciones CSS 3D (`rotateX`) y recorte de precisión que elimina parpadeos visuales y saltos de ancho numérico.
- **Sincronismo Sub-Segundo entre Dispositivos**: Los ticks se alinean a la frontera exacta del segundo atómico universal (`1000 - (horaUTC % 1000)`), garantizando que móviles y computadoras cambien de segundo al unísono.
- **Sincronización Internacional SNTP**: Compensa la desviación del hardware local y la latencia de red (*jitter*) consultando servidores atómicos internacionales con cálculo de ida y vuelta (*Round-Trip Time*).
- **Recuperación tras Suspensión Móvil**: Re-sincroniza automáticamente a través de la API `visibilitychange` tan pronto como el usuario desbloquea el teléfono o regresa a la pestaña.
- **Selector Dinámico de Ciudades y Zonas Horarias**: Inicia siempre por defecto en **Buenos Aires (GMT-3)** en cada recarga de página, permitiendo recalibrar la hora en vivo para ciudades globales (Madrid, Nueva York, Tokio, Londres, Ciudad de México, etc.).
- **Arquitectura con Patrón de Módulo**: Estado privado blindado mediante clausuras (*closures*), exponiendo únicamente los métodos de control autorizados.
- **Accesible (WCAG 2.2 AA)**: Navegación completa por teclado, indicadores visibles de foco, contraste cromático validado y regiones dinámicas para lectores de pantalla (`aria-live="polite"`, `role="status"`).

---

## 🏛️ Fundamentos Arquitectónicos

### 1. El Patrón de Módulo Revelador (`countdownTimer.js`)
Dejar variables como el `setInterval` o los cálculos en el ámbito global expone al sistema a colisiones y fugas de memoria (*memory leaks*). El módulo encapsula la lógica interna y expone únicamente una API pública limpia:

```javascript
export const createCountdownTimer = () => {
  // 1. Ámbito Privado (Encapsulado)
  let timeoutId = null;
  let targetTimestamp = null;
  let serverOffset = 0;

  // 2. Métodos Privados (Cálculos matemáticos, SNTP, alineación)
  const calculateRemaining = () => { ... };
  const scheduleNextTick = () => { ... };

  // 3. Interfaz Pública (Revealing)
  return {
    syncWithInternationalServer,
    getAuthoritativeNow,
    isSynchronized,
    start,
    stop,
    retarget,
    realign
  };
};
```

### 2. Eliminación del Desfase entre Dispositivos (Alineación de Fase)
Un `setInterval(tick, 1000)` ordinario se ejecuta en el milisegundo arbitrario en que cargó la página en cada pantalla. Si la PC la abrió a los `.100ms` y el móvil a los `.850ms`, se produce un desfase visual de hasta 750 ms.

Este proyecto resuelve ese problema calculando los milisegundos restantes hasta el cambio exacto de segundo universal:
```javascript
const authoritativeNow = getAuthoritativeNow();
const elapsedInSecond = authoritativeNow % 1000;
const msUntilNextSecond = 1000 - elapsedInSecond;

// Programa la ejecución en el milisegundo cero de la hora universal
timeoutId = setTimeout(tick, Math.max(15, msUntilNextSecond + 15));
```

---

## 🛠️ Estructura del Proyecto

```
├── index.html          # Estructura semántica y accesible de la interfaz
├── styles.css          # Tokens de diseño, animaciones 3D y reglas responsivas
├── countdownTimer.js   # Módulo encapsulado de cuenta regresiva y sincronización SNTP
├── app.js              # Controlador de vista, eventos y detector de suspensión
└── README.md           # Documentación técnica
```

---

## 💻 Ejecución Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/corbaz/reloj.git
   cd reloj
   ```

2. Inicia un servidor HTTP local (requerido para módulos ES):
   ```bash
   npx serve . -l 3000
   ```
   *(O utilizando Python: `python -m http.server 3000`)*

3. Ábrelo en tu navegador:
   - Computadora: [http://localhost:3000](http://localhost:3000)
   - Móvil: `http://<IP_LOCAL>:3000`

---

## 📄 Licencia

MIT
