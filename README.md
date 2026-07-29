# Reclamos RMN

Sistema de gestión de reclamos de informes de resonancia magnética (RMN) para
el sector administrativo y para los médicos que informan los estudios.

Es una **PWA estática** (HTML/CSS/JS sin build ni frameworks) que se conecta
a una planilla de Google Sheets a través de un **Google Apps Script**
publicado como Web App.

## Roles

| Página | Para quién | Qué hace |
|---|---|---|
| [`index.html`](index.html) | Todos | Landing, elegís el rol (Administrativo / Médico) |
| [`pages/administrativo.html`](pages/administrativo.html) | Administrativo | Carga reclamos, hace seguimiento, entrega informes, gestiona recitados |
| [`pages/medico.html`](pages/medico.html) | Médico | Ve los reclamos pendientes de informar, los resuelve, pide recitación de turno |
| [`pages/analitica.html`](pages/analitica.html) | Administrativo | Dashboard: reclamos por mes, por estudio, por región, tiempo de resolución |

## Arquitectura

```
Navegador (PWA)  ──fetch──►  Google Apps Script (Web App)  ──►  Google Sheets
   js/api.js                 appsscript-reclamos/Código.js         (BD)
```

- El frontend no tiene backend propio: todo el estado vive en una hoja de
  cálculo de Google Sheets, y `js/api.js` habla con ella vía HTTP
  (`fetch`) contra la URL del Web App de Apps Script (acciones `list`,
  `stats`, `add`, `update`, `resolver`, `entregar`, `recitar`, etc. — ver
  [`js/api.js`](js/api.js)).
- La URL del Web App **no está hardcodeada**: la primera vez que se abre la
  app en un dispositivo nuevo, pide pegarla (pantalla de configuración en
  `js/api.js`) y la guarda en `localStorage`. Nunca se sube a GitHub.
- El código del backend vive en [`appsscript-reclamos/Código.js`](appsscript-reclamos/Código.js),
  un proyecto de Apps Script aparte, clonado localmente con `clasp` (su
  `.clasp.json`/`.clasprc.json` están en `.gitignore`, no se versionan).

> ⚠️ Este repo también tuvo en algún momento una carpeta `appsscript/`
> apuntando a un proyecto de Apps Script **distinto** (turnos/agenda, no
> reclamos). Si alguna vez aparece esa carpeta de nuevo, no es la de este
> proyecto — el backend real de reclamos es `appsscript-reclamos/`.

## Estructura del repo

```
├── index.html              Landing / selector de rol
├── manifest.json           Manifest de la PWA (íconos, nombre, colores)
├── favicon.ico, icon-*.png Íconos de la app
├── js/
│   └── api.js               Conexión con Apps Script + pantalla de config inicial
├── pages/
│   ├── administrativo.html  Panel administrativo (todo el CSS/JS inline)
│   ├── medico.html          Panel médico (todo el CSS/JS inline)
│   └── analitica.html       Dashboard de analítica (solo administrativo)
└── appsscript-reclamos/
    ├── Código.js             Backend: doGet/doPost, lectura y escritura en Sheets
    └── appsscript.json       Config del proyecto de Apps Script
```

No hay build step: son HTML sueltos con `<style>`/`<script>` inline,
pensados para servirse tal cual (ej. GitHub Pages).

## Funcionalidades principales

**Reclamos**
- Alta de reclamo (vinculado a un turno existente por DNI, o manual).
- Estados: `pendiente` → `resuelto` (médico informó) → `entregado`
  (administrativo lo entregó). También `revisado-admin` como marca
  intermedia.
- Resolución por región del cuerpo cuando el estudio abarca varias
  (ej. columna completa: cervical + dorsal + lumbar).
- Archivado automático de reclamos con **+3 meses** de antigüedad (se
  calcula en cada `getStats()`), con categoría propia y búsqueda por DNI
  que también los encuentra.

**Recitados** (cuando el paciente necesita un turno nuevo)
- El médico marca un reclamo como "a recitar" con un motivo → pasa a
  `recitar` (esperando que administrativo le asigne turno nuevo).
- Administrativo le asigna fecha → pasa a `recitado` (turno ya asignado,
  vuelve al flujo normal para que el médico lo informe).
- En administrativo, la categoría "Por recitar" del sidebar muestra ambas
  sub-listas en pestañas.

**Navegación (administrativo)**
- Sin tabs fijas: las cajas de estadísticas del costado izquierdo son la
  navegación. Cada una filtra la lista y, si la categoría tiene estados
  relacionados (Resueltos/Entregados, Por recitar/Recitados), muestra
  sub-pestañas propias en vez de mezclar todo.

**Avisos**
- Popup persistente en administrativo cuando el médico informa un
  reclamo: agrupa todos los nuevos en un solo aviso y no se cierra solo —
  hay que confirmarlo. El reconocimiento se guarda en `localStorage`
  (por navegador).
- Sistema de "novedades" (`ANUNCIOS` en cada página): al publicar una
  función nueva, se agrega una entrada con fecha de publicación y se
  muestra un modal durante los 3 días siguientes, una vez por sesión de
  navegador (`sessionStorage`). **Hay que actualizar el array `ANUNCIOS`
  en `administrativo.html` y `medico.html` por separado** — el contenido
  puede (y debe) ser distinto según a quién le importa cada cambio.

**Herramientas de administrativo**
- Exportar la lista que se está viendo a CSV (`;` como separador, para
  que Excel en es-AR lo abra bien).
- Buscar por DNI muestra el historial completo de reclamos previos de
  ese paciente, no solo el turno que se vincula.
- Selección múltiple para marcar varios pendientes como "revisado" de
  una sola vez (con re-chequeo de estado por si alguien cambió uno de
  los seleccionados mientras tanto).
- Dashboard de **Analítica** ([`pages/analitica.html`](pages/analitica.html)):
  reclamos por mes, por tipo de estudio, por región del cuerpo y tiempo
  promedio de resolución, con filtro de período. Usa la acción
  `analitica` del backend, que trae el histórico completo (incluidos
  archivados).

**Confiabilidad del backend**
- `doPost` toma un `LockService.getScriptLock()` antes de escribir, para
  que dos cambios simultáneos (ej. dos regiones de un mismo reclamo) no
  se pisen.
- `getConfigData()` (regiones del cuerpo) cachea 10 minutos con
  `CacheService` — esa planilla casi no cambia.
- `getDataRows()` valida que la hoja `BD` tenga al menos 40 columnas y
  que los headers que el propio backend gestiona no hayan cambiado de
  texto, para avisar con un error claro en vez de romperse en silencio
  si alguien edita la planilla a mano.
- Cada escritura exitosa queda registrada en una hoja `Log_Reclamos`
  (fecha, acción, id, payload) — auditoría básica, sin "quién" todavía
  porque el sistema no tiene login (ver Notas).
- Backup semanal automático de todo el archivo a Drive (`backupSemanalBD`),
  con limpieza de copias de más de 60 días. **Requiere correr
  `instalarTriggerBackupSemanal()` una vez a mano** desde el editor de
  Apps Script para activar el trigger — ver sección Desarrollo.

**Performance**
- Una sola acción de backend (`dashboard`) devuelve lista + stats +
  recitados juntos, con una única lectura de la planilla, en vez de 3
  ejecuciones de Apps Script separadas por cada refresh (cada 30s).
  `listReclamos`/`listRecitados`/`getStats` aceptan filas ya leídas para
  no duplicar el trabajo.
- En médico, `getConfig()` (regiones) se pide en paralelo con
  `recargar()` en vez de esperar a que termine todo el ciclo antes de
  arrancar.

## Desarrollo

### Frontend
Son archivos estáticos — para probarlos alcanza con abrirlos en el
navegador o servirlos con cualquier servidor estático. Los cambios se
suben directo a `main` (no hay CI/build).

### Backend (Apps Script)
```bash
cd appsscript-reclamos
clasp pull                          # traer cambios hechos desde el editor web
# ... editar Código.js ...
clasp push                          # subir cambios al proyecto de Apps Script
clasp deployments                   # ver el ID del deployment activo
clasp deploy -i <deploymentId> \    # actualizar ESE deployment (misma URL
  --description "..."               # que ya usa todo el mundo)
```

⚠️ `clasp deploy` sin `-i` crea un deployment **nuevo con URL nueva** — el
personal que ya tiene la URL vieja guardada no vería los cambios. Para que
el cambio quede visible para todos sin que nadie reconfigure nada, hay que
actualizar el deployment existente con `-i`.

**Backup semanal — activación manual (una sola vez):** desde
[script.google.com](https://script.google.com), abrir el proyecto,
elegir la función `instalarTriggerBackupSemanal` en el desplegable de
"Ejecutar" y correrla. Puede pedir reautorizar permisos de Drive la
primera vez (es normal, hay que aceptarlo). Después queda corriendo solo
los domingos a las 3am — no hace falta repetirlo.

### Google Sheets
La hoja `BD` tiene ~40 columnas mapeadas en el objeto `COL` de
`Código.js` (fecha, paciente, estudio, estado del reclamo, campos de
recitación, columna `RECLAMO_ARCHIVADO`, etc.). Si se agrega una columna
nueva a la planilla, hay que sumarla ahí también.

## Notas

- Los colores de "días de retraso" (naranja ≥30 días, rojo ≥90) están
  duplicados en el CSS de `administrativo.html` y `medico.html` — si se
  ajustan los umbrales, hay que tocar ambos archivos.
- `.clasp.json` y `.clasprc.json` de `appsscript-reclamos/` están en
  `.gitignore`: son credenciales/config local de `clasp`, no se suben.

### Decisiones descartadas (a propósito, no por olvido)

- **Autenticación (PIN/login):** evaluada y descartada. Es una
  herramienta interna del hospital, sin datos expuestos a terceros más
  allá de lo que ya es accesible en la planilla de Sheets, y no hace
  falta trazabilidad de "quién resolvió qué". Si el contexto cambia
  (se comparte más ampliamente, se necesita accountability real), vale
  la pena reconsiderarlo.
- **Avisos por email/WhatsApp:** descartado — los médicos ya entran
  todos los días a revisar la lista, así que no resuelve un problema
  real hoy.
- **Soporte offline real (service worker):** descartado. La base de
  datos es Google Sheets, así que no hay forma de tener la app
  realmente offline (no se pueden cargar reclamos ni ver datos frescos
  sin conexión) — a lo sumo amortiguaría cortes de conexión de unos
  segundos, y el toast de error + reintento manual que ya existe cubre
  ese caso razonablemente.
- **Migrar de Sheets a una base de datos real:** descartado por ahora.
  Con el volumen actual (~150-200 reclamos activos) la lentitud que
  había era ineficiencia evitable (ver Performance más arriba), no un
  techo real de Sheets. Reconsiderar solo si el volumen crece mucho —
  y en ese caso, un servidor alojado es mejor opción que una máquina
  local del hospital, porque la PWA se sirve desde internet público
  (GitHub Pages).
  - Ya existe una app/API corriendo en Railway (para otro proyecto), así
    que la infraestructura de hosting no sería el obstáculo. Aun así se
    descartó: implicaría reescribir todo el backend (`Código.js`, ~15
    acciones) contra Postgres — GitHub Pages es estático y nunca puede
    hablar directo con una base de datos, necesitaría igual una API en
    el medio — y ni el valor de los datos ni el tamaño de esta app
    justifican ese esfuerzo hoy.
