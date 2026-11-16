# Cycling App

App web instalable (PWA) para entrenar en bicicleta estática con rutinas guiadas.
Reemplaza el video de la clase: muestra el esfuerzo, la posición (sentado o de pie),
el tiempo que queda de cada tramo y el próximo cambio, y avisa con voz y pitidos.

- Funciona sin internet una vez abierta.
- Botón de silencio para los avisos.
- Mantiene la pantalla encendida durante la clase.

## Probar en tu computadora

```sh
cd public
python3 -m http.server 8000
# abre http://localhost:8000
```

## Publicación

Cada cambio en `main` se publica solo en GitHub Pages
(`.github/workflows/pages.yml`). En el repo: **Settings → Pages → Source: GitHub Actions**.

## Agregar una rutina

1. Crea `public/routines/<id>.json` con este formato:

   ```json
   {
     "id": "mi-rutina",
     "name": "Mi rutina",
     "description": "Texto corto",
     "segments": [
       { "duration": 120, "effort": 0, "position": "sentado", "label": "Calentamiento" },
       { "duration": 40,  "effort": 3, "position": "de_pie",  "label": "Bloque 1 · intervalo 1 de 8" }
     ]
   }
   ```

   - `duration`: segundos.
   - `effort`: 0 Muy ligero, 1 Ligero, 2 Moderado, 3 Intenso, 4 Muy intenso, 5 Máximo.
   - `position`: `sentado`, `de_pie` o `estiramiento`.
2. Agrégala a `public/routines/index.json`.
3. Agrégala a la lista `FILES` de `public/sw.js` y sube `VERSION`.
