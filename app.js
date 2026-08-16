"use strict";

const APP_VERSION = "5.0.0";
const CONFIG_FORMAT = "rowan-furniture-planner";
const CONFIG_SCHEMA_VERSION = 4;
const FURNITURE_FORMAT = "rowan-furniture-object";
const FURNITURE_SCHEMA_VERSION = 1;
const BACKUP_FORMAT = "rowan-floor-planner-device-backup";
const BACKUP_SCHEMA_VERSION = 1;
const VIEWBOX_WIDTH = 2020;
const VIEWBOX_HEIGHT = 1900;
const SVG_NS = "http://www.w3.org/2000/svg";

const DB_NAME = "rowan-floor-planner";
const DB_VERSION = 1;
const CONFIG_STORE = "configurations";
const FURNITURE_STORE = "furniture";

const state = {
  objects: [],
  selectedId: null,
  nextId: 1,
  dragging: null,
  calibration: null,
  zoomPercent: 100,
  loadedConfigName: null,
  loadedFurnitureName: null
}; // closes state object

let dbPromise = null;

function byId(id) {
  return document.getElementById(id);
} // closes byId

function announce(message) {
  byId("status").textContent = message;
} // closes announce

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
} // closes clamp

function feetAndInchesToInches(feetValue, inchesValue) {
  return Math.max(0, (Number(feetValue) || 0) * 12 + (Number(inchesValue) || 0));
} // closes feetAndInchesToInches

function inchesToReadable(value) {
  const rounded = Math.round(Math.max(0, Number(value) || 0) * 4) / 4;
  const feet = Math.floor(rounded / 12);
  const inches = Math.round((rounded - feet * 12) * 4) / 4;

  return feet + " ft " + inches + " in";
} // closes inchesToReadable

function ppfX() {
  return Math.max(1, Number(byId("ppfX").value) || 61.5);
} // closes ppfX

function ppfY() {
  return Math.max(1, Number(byId("ppfY").value) || 54.5);
} // closes ppfY

function movementInches() {
  const value = feetAndInchesToInches(byId("unitFeet").value, byId("unitInches").value);

  return value > 0 ? value : 6;
} // closes movementInches

function snapEnabled() {
  return byId("snapToggle").checked;
} // closes snapEnabled

function gridPixelStepX() {
  return movementInches() / 12 * ppfX();
} // closes gridPixelStepX

function gridPixelStepY() {
  return movementInches() / 12 * ppfY();
} // closes gridPixelStepY

function snapPixelX(value) {
  if (!snapEnabled()) {
    return value;
  } // closes no-snap X branch

  const step = gridPixelStepX();

  return Math.round(value / step) * step;
} // closes snapPixelX

function snapPixelY(value) {
  if (!snapEnabled()) {
    return value;
  } // closes no-snap Y branch

  const step = gridPixelStepY();

  return Math.round(value / step) * step;
} // closes snapPixelY

function ratioToPixelX(ratio) {
  return clamp(Number(ratio) || 0, 0, 1) * VIEWBOX_WIDTH;
} // closes ratioToPixelX

function ratioToPixelY(ratio) {
  return clamp(Number(ratio) || 0, 0, 1) * VIEWBOX_HEIGHT;
} // closes ratioToPixelY

function pixelToRatioX(pixel) {
  return clamp(pixel / VIEWBOX_WIDTH, 0, 1);
} // closes pixelToRatioX

function pixelToRatioY(pixel) {
  return clamp(pixel / VIEWBOX_HEIGHT, 0, 1);
} // closes pixelToRatioY

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  } // closes existing DB promise branch

  dbPromise = new Promise(function (resolve, reject) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function () {
      const db = request.result;

      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, {
          keyPath: "name"
        }); // closes configuration store options
      } // closes missing configuration store branch

      if (!db.objectStoreNames.contains(FURNITURE_STORE)) {
        db.createObjectStore(FURNITURE_STORE, {
          keyPath: "name"
        }); // closes furniture store options
      } // closes missing furniture store branch
    }; // closes DB upgrade callback

    request.onsuccess = function () {
      resolve(request.result);
    }; // closes DB success callback

    request.onerror = function () {
      reject(request.error || new Error("Could not open device storage."));
    }; // closes DB error callback
  }); // closes DB promise

  return dbPromise;
} // closes openDatabase

async function storeGetAll(storeName) {
  const db = await openDatabase();

  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();

    request.onsuccess = function () {
      resolve(request.result || []);
    }; // closes get-all success callback

    request.onerror = function () {
      reject(request.error || new Error("Could not read device storage."));
    }; // closes get-all error callback
  }); // closes get-all promise
} // closes storeGetAll

async function storeGet(storeName, key) {
  const db = await openDatabase();

  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);

    request.onsuccess = function () {
      resolve(request.result || null);
    }; // closes get success callback

    request.onerror = function () {
      reject(request.error || new Error("Could not read saved data."));
    }; // closes get error callback
  }); // closes get promise
} // closes storeGet

async function storePut(storeName, record) {
  const db = await openDatabase();

  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, "readwrite");

    tx.objectStore(storeName).put(record);

    tx.oncomplete = function () {
      resolve();
    }; // closes put complete callback

    tx.onerror = function () {
      reject(tx.error || new Error("Could not save data on this device."));
    }; // closes put error callback
  }); // closes put promise
} // closes storePut

async function storeDelete(storeName, key) {
  const db = await openDatabase();

  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, "readwrite");

    tx.objectStore(storeName).delete(key);

    tx.oncomplete = function () {
      resolve();
    }; // closes delete complete callback

    tx.onerror = function () {
      reject(tx.error || new Error("Could not delete saved data."));
    }; // closes delete error callback
  }); // closes delete promise
} // closes storeDelete

async function clearAllStores() {
  const db = await openDatabase();

  return new Promise(function (resolve, reject) {
    const tx = db.transaction([CONFIG_STORE, FURNITURE_STORE], "readwrite");

    tx.objectStore(CONFIG_STORE).clear();
    tx.objectStore(FURNITURE_STORE).clear();

    tx.oncomplete = function () {
      resolve();
    }; // closes clear complete callback

    tx.onerror = function () {
      reject(tx.error || new Error("Could not clear planner data."));
    }; // closes clear error callback
  }); // closes clear promise
} // closes clearAllStores

function svgElement(name) {
  return document.createElementNS(SVG_NS, name);
} // closes svgElement

function rgbaFill(hex, alpha) {
  const clean = String(hex || "#3b82f6").replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);

  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
} // closes rgbaFill

function getEditorFurniture() {
  return {
    label: byId("labelInput").value.trim() || "Furniture",
    shape: byId("shapeInput").value === "ellipse" ? "ellipse" : "rect",
    color: byId("colorInput").value,
    widthInches: Math.max(1, feetAndInchesToInches(byId("widthFeet").value, byId("widthInches").value)),
    depthInches: Math.max(1, feetAndInchesToInches(byId("depthFeet").value, byId("depthInches").value)),
    rotation: [0, 90, 180, 270].includes(Number(byId("rotationInput").value)) ? Number(byId("rotationInput").value) : 0
  }; // closes editor furniture object
} // closes getEditorFurniture

function setFeetInches(feetId, inchesId, totalInches) {
  const rounded = Math.round(Math.max(0, Number(totalInches) || 0) * 4) / 4;

  byId(feetId).value = Math.floor(rounded / 12);
  byId(inchesId).value = Math.round((rounded % 12) * 4) / 4;
} // closes setFeetInches

function setEditorFurniture(furniture) {
  byId("labelInput").value = String(furniture.label || "Furniture");
  byId("shapeInput").value = furniture.shape === "ellipse" ? "ellipse" : "rect";
  byId("colorInput").value = String(furniture.color || "#3b82f6");
  setFeetInches("widthFeet", "widthInches", Math.max(1, Number(furniture.widthInches) || 12));
  setFeetInches("depthFeet", "depthInches", Math.max(1, Number(furniture.depthInches) || 12));
  byId("rotationInput").value = String([0, 90, 180, 270].includes(Number(furniture.rotation)) ? Number(furniture.rotation) : 0);
} // closes setEditorFurniture

function objectById(id) {
  return state.objects.find(function (item) {
    return item.id === id;
  }); // closes object find callback
} // closes objectById

function visualDimensions(obj) {
  const quarterTurn = obj.rotation === 90 || obj.rotation === 270;
  const widthInches = quarterTurn ? obj.depthInches : obj.widthInches;
  const depthInches = quarterTurn ? obj.widthInches : obj.depthInches;

  return {
    widthPx: widthInches / 12 * ppfX(),
    heightPx: depthInches / 12 * ppfY()
  }; // closes visual dimension object
} // closes visualDimensions

function addGeometry(element, obj, dimensions) {
  const x = ratioToPixelX(obj.xRatio);
  const y = ratioToPixelY(obj.yRatio);

  if (obj.shape === "ellipse") {
    element.setAttribute("cx", x);
    element.setAttribute("cy", y);
    element.setAttribute("rx", dimensions.widthPx / 2);
    element.setAttribute("ry", dimensions.heightPx / 2);
  } else {
    element.setAttribute("x", x - dimensions.widthPx / 2);
    element.setAttribute("y", y - dimensions.heightPx / 2);
    element.setAttribute("width", dimensions.widthPx);
    element.setAttribute("height", dimensions.heightPx);
    element.setAttribute("rx", "5");
  } // closes geometry shape branch
} // closes addGeometry

function renderObjects() {
  const layer = byId("objectsLayer");

  layer.replaceChildren();

  state.objects.forEach(function (obj) {
    const dimensions = visualDimensions(obj);
    const group = svgElement("g");
    const shape = svgElement(obj.shape === "ellipse" ? "ellipse" : "rect");

    addGeometry(shape, obj, dimensions);
    shape.setAttribute("fill", rgbaFill(obj.color, 0.58));
    shape.setAttribute("class", "object-shape" + (state.selectedId === obj.id ? " selected" : ""));

    const hit = svgElement(obj.shape === "ellipse" ? "ellipse" : "rect");

    addGeometry(hit, obj, dimensions);
    hit.setAttribute("class", "object-hit");
    hit.setAttribute("data-id", String(obj.id));
    hit.addEventListener("pointerdown", onObjectPointerDown);
    hit.addEventListener("click", function (event) {
      event.stopPropagation();
      selectObject(obj.id);
    }); // closes hit click listener

    const label = svgElement("text");

    label.setAttribute("x", ratioToPixelX(obj.xRatio));
    label.setAttribute("y", ratioToPixelY(obj.yRatio));
    label.setAttribute("class", "object-label");
    label.textContent = obj.label;

    group.appendChild(shape);
    group.appendChild(hit);
    group.appendChild(label);
    layer.appendChild(group);
  }); // closes render object loop

  refreshObjectList();
  refreshSelectedDetails();
} // closes renderObjects

function refreshObjectList() {
  const select = byId("objectList");

  select.replaceChildren();

  state.objects.forEach(function (obj) {
    const option = document.createElement("option");

    option.value = String(obj.id);
    option.textContent = obj.label + ", " + inchesToReadable(obj.widthInches) + " by " + inchesToReadable(obj.depthInches);
    option.selected = obj.id === state.selectedId;
    select.appendChild(option);
  }); // closes object-list loop
} // closes refreshObjectList

function refreshSelectedDetails() {
  const obj = objectById(state.selectedId);

  if (!obj) {
    byId("selectedDetails").textContent = "No object selected.";
    return;
  } // closes no selected-details branch

  const sourceText = obj.sourceFurnitureName ? " Copied from library item " + obj.sourceFurnitureName + "." : "";

  byId("selectedDetails").textContent =
    obj.label + ". " +
    inchesToReadable(obj.widthInches) + " wide by " +
    inchesToReadable(obj.depthInches) + " deep. Rotation " +
    obj.rotation + " degrees." +
    sourceText;
} // closes refreshSelectedDetails

function selectObject(id) {
  const obj = objectById(id);

  if (!obj) {
    return;
  } // closes missing selection branch

  state.selectedId = id;
  setEditorFurniture(obj);
  renderObjects();
  announce("Selected " + obj.label + ".");
} // closes selectObject

function createPlacedObject(furniture, sourceFurnitureName = null) {
  const id = state.nextId;

  state.nextId += 1;

  return {
    id: id,
    label: String(furniture.label || ("Furniture " + id)),
    shape: furniture.shape === "ellipse" ? "ellipse" : "rect",
    color: String(furniture.color || "#3b82f6"),
    widthInches: Math.max(1, Number(furniture.widthInches) || 12),
    depthInches: Math.max(1, Number(furniture.depthInches) || 12),
    rotation: [0, 90, 180, 270].includes(Number(furniture.rotation)) ? Number(furniture.rotation) : 0,
    xRatio: pixelToRatioX(snapPixelX(VIEWBOX_WIDTH / 2)),
    yRatio: pixelToRatioY(snapPixelY(VIEWBOX_HEIGHT / 2)),
    sourceFurnitureName: sourceFurnitureName ? String(sourceFurnitureName) : null
  }; // closes placed object
} // closes createPlacedObject

function addEditorFurniture() {
  const obj = createPlacedObject(getEditorFurniture(), null);

  state.objects.push(obj);
  state.selectedId = obj.id;
  renderObjects();
  announce("Added " + obj.label + " from the editor.");
} // closes addEditorFurniture

function applyObject() {
  const obj = objectById(state.selectedId);

  if (!obj) {
    announce("Select furniture in the layout first.");
    return;
  } // closes no selected apply branch

  const edited = getEditorFurniture();

  obj.label = edited.label;
  obj.shape = edited.shape;
  obj.color = edited.color;
  obj.widthInches = edited.widthInches;
  obj.depthInches = edited.depthInches;
  obj.rotation = edited.rotation;

  renderObjects();
  announce("Updated selected layout object " + obj.label + ". The reusable library copy was not changed.");
} // closes applyObject

function rotateObject() {
  const obj = objectById(state.selectedId);

  if (!obj) {
    announce("Select furniture in the layout first.");
    return;
  } // closes no selected rotate branch

  obj.rotation = (obj.rotation + 90) % 360;
  byId("rotationInput").value = String(obj.rotation);
  renderObjects();
  announce("Rotated " + obj.label + ".");
} // closes rotateObject

function duplicateObject() {
  const source = objectById(state.selectedId);

  if (!source) {
    announce("Select furniture in the layout first.");
    return;
  } // closes no duplicate source branch

  const copy = {
    id: state.nextId,
    label: source.label + " copy",
    shape: source.shape,
    color: source.color,
    widthInches: source.widthInches,
    depthInches: source.depthInches,
    rotation: source.rotation,
    xRatio: pixelToRatioX(snapPixelX(ratioToPixelX(source.xRatio) + gridPixelStepX())),
    yRatio: pixelToRatioY(snapPixelY(ratioToPixelY(source.yRatio) + gridPixelStepY())),
    sourceFurnitureName: source.sourceFurnitureName || null
  }; // closes duplicate placed object

  state.nextId += 1;
  state.objects.push(copy);
  state.selectedId = copy.id;
  setEditorFurniture(copy);
  renderObjects();
  announce("Duplicated " + source.label + " inside this layout.");
} // closes duplicateObject

function deleteObject() {
  const obj = objectById(state.selectedId);

  if (!obj) {
    announce("Select furniture in the layout first.");
    return;
  } // closes no delete selection branch

  state.objects = state.objects.filter(function (item) {
    return item.id !== obj.id;
  }); // closes delete filter

  state.selectedId = null;
  renderObjects();
  announce("Deleted " + obj.label + " from this layout. The reusable furniture library was not changed.");
} // closes deleteObject

function svgPointFromClient(clientX, clientY) {
  const svg = byId("overlay");
  const point = svg.createSVGPoint();

  point.x = clientX;
  point.y = clientY;

  const transformed = point.matrixTransform(svg.getScreenCTM().inverse());

  return {
    x: transformed.x,
    y: transformed.y
  }; // closes SVG point result
} // closes svgPointFromClient

function onObjectPointerDown(event) {
  event.preventDefault();
  event.stopPropagation();

  const id = Number(event.currentTarget.getAttribute("data-id"));

  selectObject(id);

  const obj = objectById(id);
  const point = svgPointFromClient(event.clientX, event.clientY);

  state.dragging = {
    pointerId: event.pointerId,
    id: id,
    offsetX: point.x - ratioToPixelX(obj.xRatio),
    offsetY: point.y - ratioToPixelY(obj.yRatio)
  }; // closes dragging object

  byId("overlay").setPointerCapture(event.pointerId);
} // closes onObjectPointerDown

function onOverlayPointerMove(event) {
  if (!state.dragging || state.dragging.pointerId !== event.pointerId) {
    return;
  } // closes inactive drag branch

  const obj = objectById(state.dragging.id);

  if (!obj) {
    return;
  } // closes missing drag object branch

  const point = svgPointFromClient(event.clientX, event.clientY);

  obj.xRatio = pixelToRatioX(snapPixelX(point.x - state.dragging.offsetX));
  obj.yRatio = pixelToRatioY(snapPixelY(point.y - state.dragging.offsetY));
  renderObjects();
} // closes onOverlayPointerMove

function onOverlayPointerUp(event) {
  if (!state.dragging || state.dragging.pointerId !== event.pointerId) {
    return;
  } // closes inactive pointer-up branch

  const obj = objectById(state.dragging.id);

  state.dragging = null;

  try {
    byId("overlay").releasePointerCapture(event.pointerId);
  } catch (error) {
    console.debug("Pointer capture already released.", error);
  } // closes pointer release try/catch

  if (obj) {
    announce(obj.label + " moved.");
  } // closes moved announcement branch
} // closes onOverlayPointerUp

function nudgeSelected(dxUnits, dyUnits) {
  const obj = objectById(state.selectedId);

  if (!obj) {
    announce("Select furniture in the layout first.");
    return;
  } // closes no nudge selection branch

  obj.xRatio = pixelToRatioX(snapPixelX(ratioToPixelX(obj.xRatio) + dxUnits * gridPixelStepX()));
  obj.yRatio = pixelToRatioY(snapPixelY(ratioToPixelY(obj.yRatio) + dyUnits * gridPixelStepY()));
  renderObjects();
} // closes nudgeSelected

function onStageKeyDown(event) {
  const amount = event.shiftKey ? 5 : 1;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    nudgeSelected(-amount, 0);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    nudgeSelected(amount, 0);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    nudgeSelected(0, -amount);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    nudgeSelected(0, amount);
  } else if (event.key === "Delete") {
    event.preventDefault();
    deleteObject();
  } // closes keyboard action branch
} // closes onStageKeyDown

function updateGrid() {
  const sx = gridPixelStepX();
  const sy = gridPixelStepY();

  byId("gridPattern").setAttribute("width", sx);
  byId("gridPattern").setAttribute("height", sy);
  byId("gridPath").setAttribute("d", "M " + sx + " 0 L 0 0 0 " + sy);
  byId("gridRect").style.display = byId("gridToggle").checked ? "" : "none";
  renderObjects();
} // closes updateGrid

function setZoom(value) {
  state.zoomPercent = clamp(Number(value) || 100, 60, 220);
  byId("zoomRange").value = String(state.zoomPercent);
  byId("zoomValue").textContent = state.zoomPercent + "%";
  byId("stageWrap").style.width = state.zoomPercent === 100 ? "100%" : state.zoomPercent + "%";
} // closes setZoom

function beginCalibration(axis) {
  state.calibration = {
    axis: axis,
    points: []
  }; // closes calibration state

  byId("calibrationLayer").replaceChildren();
  announce("Calibration mode. Tap two points marking a known " + (axis === "x" ? "horizontal" : "vertical") + " distance.");
} // closes beginCalibration

function onOverlayClick(event) {
  if (!state.calibration) {
    return;
  } // closes no calibration branch

  const point = svgPointFromClient(event.clientX, event.clientY);

  state.calibration.points.push(point);

  if (state.calibration.points.length === 1) {
    announce("First point set. Tap the second point.");
    return;
  } // closes first calibration point branch

  const first = state.calibration.points[0];
  const second = state.calibration.points[1];
  const line = svgElement("line");

  line.setAttribute("x1", first.x);
  line.setAttribute("y1", first.y);
  line.setAttribute("x2", second.x);
  line.setAttribute("y2", second.y);
  line.setAttribute("class", "calibration-line");
  byId("calibrationLayer").replaceChildren(line);

  const feetText = window.prompt("Known distance, feet:", "10");
  const inchesText = feetText === null ? null : window.prompt("Additional inches:", "0");

  if (feetText === null || inchesText === null) {
    state.calibration = null;
    byId("calibrationLayer").replaceChildren();
    announce("Calibration cancelled.");
    return;
  } // closes cancelled calibration branch

  const knownFeet = feetAndInchesToInches(feetText, inchesText) / 12;

  if (knownFeet <= 0) {
    state.calibration = null;
    byId("calibrationLayer").replaceChildren();
    announce("Calibration distance must be greater than zero.");
    return;
  } // closes invalid calibration branch

  if (state.calibration.axis === "x") {
    byId("ppfX").value = (Math.abs(second.x - first.x) / knownFeet).toFixed(2);
  } else {
    byId("ppfY").value = (Math.abs(second.y - first.y) / knownFeet).toFixed(2);
  } // closes calibration axis branch

  state.calibration = null;
  byId("calibrationLayer").replaceChildren();
  updateGrid();
  announce("Calibration updated.");
} // closes onOverlayClick

function configurationData() {
  return {
    format: CONFIG_FORMAT,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    savedAt: new Date().toISOString(),
    name: byId("configurationName").value.trim() || "Untitled",
    plan: {
      id: "rowan-chestnut-a6",
      viewBox: {
        width: VIEWBOX_WIDTH,
        height: VIEWBOX_HEIGHT
      }, // closes configuration viewBox
      scale: {
        xPixelsPerFoot: ppfX(),
        yPixelsPerFoot: ppfY()
      } // closes configuration scale
    }, // closes configuration plan
    settings: {
      movementInches: movementInches(),
      snapToGrid: byId("snapToggle").checked,
      showGrid: byId("gridToggle").checked,
      floorplanOpacity: Number(byId("opacitySlider").value) / 100
    }, // closes configuration settings
    objects: state.objects.map(function (obj) {
      return {
        id: obj.id,
        label: obj.label,
        shape: obj.shape,
        color: obj.color,
        widthInches: obj.widthInches,
        depthInches: obj.depthInches,
        rotation: obj.rotation,
        sourceFurnitureName: obj.sourceFurnitureName || null,
        position: {
          xRatio: obj.xRatio,
          yRatio: obj.yRatio
        } // closes configuration object position
      }; // closes serialized configuration object
    }) // closes configuration object map
  }; // closes configuration data
} // closes configurationData

function furnitureLibraryData(name) {
  return {
    format: FURNITURE_FORMAT,
    schemaVersion: FURNITURE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    savedAt: new Date().toISOString(),
    name: name,
    furniture: getEditorFurniture()
  }; // closes furniture library data
} // closes furnitureLibraryData

function migrateConfig(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Configuration is not a JSON object.");
  } // closes invalid raw configuration branch

  if (raw.format === CONFIG_FORMAT && Number(raw.schemaVersion) === 4) {
    return raw;
  } // closes native v4 configuration branch

  if (raw.format === CONFIG_FORMAT && [2, 3].includes(Number(raw.schemaVersion))) {
    const migrated = JSON.parse(JSON.stringify(raw));

    migrated.schemaVersion = 4;
    migrated.appVersion = APP_VERSION;
    migrated.savedAt = new Date().toISOString();
    migrated.objects = (Array.isArray(migrated.objects) ? migrated.objects : []).map(function (obj) {
      obj.sourceFurnitureName = obj.sourceFurnitureName || null;
      return obj;
    }); // closes v2/v3 object migration

    return migrated;
  } // closes v2/v3 migration branch

  const looksLikeV1 = Array.isArray(raw.objects) && (
    Number(raw.version) === 1 ||
    Number(raw.schemaVersion) === 1 ||
    raw.format === undefined
  );

  if (looksLikeV1) {
    const oldScaleX = Number(raw.scale && raw.scale.ppfX) || 61.5;
    const oldScaleY = Number(raw.scale && raw.scale.ppfY) || 54.5;
    const oldGridFeet = Number(raw.grid && raw.grid.feet) || 0;
    const oldGridInches = Number(raw.grid && raw.grid.inches) || 6;

    return {
      format: CONFIG_FORMAT,
      schemaVersion: 4,
      appVersion: APP_VERSION,
      savedAt: new Date().toISOString(),
      name: String(raw.name || "Migrated v1 layout"),
      plan: {
        id: "rowan-chestnut-a6",
        viewBox: {
          width: VIEWBOX_WIDTH,
          height: VIEWBOX_HEIGHT
        }, // closes migrated v1 viewBox
        scale: {
          xPixelsPerFoot: oldScaleX,
          yPixelsPerFoot: oldScaleY
        } // closes migrated v1 scale
      }, // closes migrated v1 plan
      settings: {
        movementInches: oldGridFeet * 12 + oldGridInches,
        snapToGrid: raw.grid ? raw.grid.snap !== false : true,
        showGrid: raw.grid ? raw.grid.show !== false : true,
        floorplanOpacity: 0.72
      }, // closes migrated v1 settings
      objects: raw.objects.map(function (obj, index) {
        return {
          id: Number(obj.id) || index + 1,
          label: String(obj.label || "Furniture"),
          shape: obj.shape === "ellipse" ? "ellipse" : "rect",
          color: String(obj.color || "#3b82f6"),
          widthInches: Math.max(1, (Number(obj.widthFt) || 1) * 12),
          depthInches: Math.max(1, (Number(obj.lengthFt) || 1) * 12),
          rotation: [0, 90, 180, 270].includes(Number(obj.rotation)) ? Number(obj.rotation) : 0,
          sourceFurnitureName: null,
          position: {
            xRatio: clamp((Number(obj.x) || VIEWBOX_WIDTH / 2) / VIEWBOX_WIDTH, 0, 1),
            yRatio: clamp((Number(obj.y) || VIEWBOX_HEIGHT / 2) / VIEWBOX_HEIGHT, 0, 1)
          } // closes migrated v1 position
        }; // closes migrated v1 furniture object
      }) // closes migrated v1 object map
    }; // closes migrated v1 configuration
  } // closes v1 migration branch

  if (raw.format === CONFIG_FORMAT && Number(raw.schemaVersion) > CONFIG_SCHEMA_VERSION) {
    throw new Error("This configuration was created by a newer schema. Update the app before opening it.");
  } // closes future configuration schema branch

  throw new Error("Unsupported configuration format.");
} // closes migrateConfig

function applyConfiguration(raw) {
  const data = migrateConfig(raw);
  const scale = data.plan && data.plan.scale ? data.plan.scale : {};
  const settings = data.settings || {};

  byId("configurationName").value = String(data.name || "Untitled");
  byId("ppfX").value = Math.max(1, Number(scale.xPixelsPerFoot) || 61.5);
  byId("ppfY").value = Math.max(1, Number(scale.yPixelsPerFoot) || 54.5);

  const moveInches = Math.max(0.25, Number(settings.movementInches) || 6);

  byId("unitFeet").value = Math.floor(moveInches / 12);
  byId("unitInches").value = Math.round((moveInches % 12) * 4) / 4;
  byId("snapToggle").checked = settings.snapToGrid !== false;
  byId("gridToggle").checked = settings.showGrid !== false;

  const opacity = clamp(Number(settings.floorplanOpacity) || 0.72, 0, 1);

  byId("opacitySlider").value = Math.round(opacity * 100);
  byId("floorplan").style.opacity = String(opacity);

  state.objects = (Array.isArray(data.objects) ? data.objects : []).map(function (obj, index) {
    const position = obj.position || {};

    return {
      id: Number(obj.id) || index + 1,
      label: String(obj.label || "Furniture"),
      shape: obj.shape === "ellipse" ? "ellipse" : "rect",
      color: String(obj.color || "#3b82f6"),
      widthInches: Math.max(1, Number(obj.widthInches) || 12),
      depthInches: Math.max(1, Number(obj.depthInches) || 12),
      rotation: [0, 90, 180, 270].includes(Number(obj.rotation)) ? Number(obj.rotation) : 0,
      xRatio: clamp(Number(position.xRatio) || 0.5, 0, 1),
      yRatio: clamp(Number(position.yRatio) || 0.5, 0, 1),
      sourceFurnitureName: obj.sourceFurnitureName ? String(obj.sourceFurnitureName) : null
    }; // closes runtime layout object
  }); // closes runtime layout object map

  state.nextId = state.objects.reduce(function (maxId, obj) {
    return Math.max(maxId, obj.id);
  }, 0) + 1; // closes next-ID reduce

  state.selectedId = null;
  updateGrid();
} // closes applyConfiguration

function normalizeFurnitureLibraryData(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Furniture file is not a JSON object.");
  } // closes invalid furniture raw branch

  if (raw.format === FURNITURE_FORMAT && Number(raw.schemaVersion) === 1) {
    const furniture = raw.furniture || {};

    return {
      format: FURNITURE_FORMAT,
      schemaVersion: 1,
      appVersion: String(raw.appVersion || APP_VERSION),
      savedAt: String(raw.savedAt || ""),
      name: String(raw.name || furniture.label || "Furniture"),
      furniture: {
        label: String(furniture.label || "Furniture"),
        shape: furniture.shape === "ellipse" ? "ellipse" : "rect",
        color: String(furniture.color || "#3b82f6"),
        widthInches: Math.max(1, Number(furniture.widthInches) || 12),
        depthInches: Math.max(1, Number(furniture.depthInches) || 12),
        rotation: [0, 90, 180, 270].includes(Number(furniture.rotation)) ? Number(furniture.rotation) : 0
      } // closes normalized furniture payload
    }; // closes normalized furniture file
  } // closes current furniture schema branch

  if (raw.format === FURNITURE_FORMAT && Number(raw.schemaVersion) > FURNITURE_SCHEMA_VERSION) {
    throw new Error("This furniture item was created by a newer schema. Update the app before opening it.");
  } // closes future furniture schema branch

  throw new Error("Unsupported furniture file format.");
} // closes normalizeFurnitureLibraryData

async function refreshConfigurations(selectName = null) {
  const records = await storeGetAll(CONFIG_STORE);
  const select = byId("configurationSelect");

  select.replaceChildren();

  records.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  }); // closes configuration record sort

  records.forEach(function (record) {
    const option = document.createElement("option");

    option.value = record.name;
    option.textContent = record.name;
    select.appendChild(option);
  }); // closes configuration option loop

  if (selectName) {
    select.value = selectName;
  } // closes requested configuration selection branch
} // closes refreshConfigurations

async function refreshFurnitureLibrary(selectName = null) {
  const records = await storeGetAll(FURNITURE_STORE);
  const select = byId("furnitureLibrarySelect");

  select.replaceChildren();

  records.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  }); // closes furniture record sort

  records.forEach(function (record) {
    const option = document.createElement("option");

    option.value = record.name;
    option.textContent = record.name;
    select.appendChild(option);
  }); // closes furniture option loop

  if (selectName) {
    select.value = selectName;
  } // closes requested furniture selection branch
} // closes refreshFurnitureLibrary

async function loadConfiguration() {
  const name = byId("configurationSelect").value;

  if (!name) {
    announce("Choose a saved configuration.");
    return;
  } // closes missing configuration load name branch

  try {
    const record = await storeGet(CONFIG_STORE, name);

    if (!record) {
      throw new Error("Configuration was not found.");
    } // closes missing configuration record branch

    applyConfiguration(record.data);
    state.loadedConfigName = name;
    byId("configurationName").value = name;
    announce("Loaded configuration " + name + " from this device.");
  } catch (error) {
    announce(error.message);
  } // closes configuration load try/catch
} // closes loadConfiguration

async function saveConfiguration(forceSaveAs = false) {
  const name = byId("configurationName").value.trim();

  if (!name) {
    announce("Enter a configuration name.");
    byId("configurationName").focus();
    return;
  } // closes missing configuration save name branch

  if (forceSaveAs) {
    state.loadedConfigName = null;
  } // closes configuration force-save-as branch

  const data = configurationData();

  data.name = name;

  try {
    await storePut(CONFIG_STORE, {
      name: name,
      modifiedAt: new Date().toISOString(),
      data: data
    }); // closes configuration record

    state.loadedConfigName = name;
    await refreshConfigurations(name);
    announce("Saved configuration " + name + " on this device.");
  } catch (error) {
    announce(error.message);
  } // closes configuration save try/catch
} // closes saveConfiguration

async function saveAsConfiguration() {
  const proposed = byId("configurationName").value.trim() || "New configuration";
  const name = window.prompt("Save as configuration name:", proposed);

  if (name === null) {
    return;
  } // closes cancelled configuration Save As branch

  byId("configurationName").value = name.trim();
  await saveConfiguration(true);
} // closes saveAsConfiguration

async function deleteConfiguration() {
  const name = byId("configurationSelect").value;

  if (!name) {
    announce("Choose a configuration to delete.");
    return;
  } // closes missing configuration delete name branch

  if (!window.confirm("Delete configuration '" + name + "' from this device?")) {
    return;
  } // closes configuration delete confirmation branch

  try {
    await storeDelete(CONFIG_STORE, name);

    if (state.loadedConfigName === name) {
      state.loadedConfigName = null;
    } // closes deleted loaded configuration branch

    await refreshConfigurations();
    announce("Deleted configuration " + name + " from this device.");
  } catch (error) {
    announce(error.message);
  } // closes configuration delete try/catch
} // closes deleteConfiguration

async function readFurnitureLibraryItem(name) {
  const record = await storeGet(FURNITURE_STORE, name);

  if (!record) {
    throw new Error("Furniture item was not found.");
  } // closes missing furniture record branch

  return normalizeFurnitureLibraryData(record.data);
} // closes readFurnitureLibraryItem

async function loadFurnitureIntoEditor() {
  const name = byId("furnitureLibrarySelect").value;

  if (!name) {
    announce("Choose saved furniture first.");
    return;
  } // closes missing furniture load name branch

  try {
    const data = await readFurnitureLibraryItem(name);

    state.loadedFurnitureName = name;
    byId("furnitureLibraryName").value = name;
    setEditorFurniture(data.furniture);
    announce("Loaded reusable furniture " + name + " into the editor. No configuration was changed.");
  } catch (error) {
    announce(error.message);
  } // closes furniture editor load try/catch
} // closes loadFurnitureIntoEditor

async function addLibraryFurnitureToLayout() {
  const name = byId("furnitureLibrarySelect").value;

  if (!name) {
    announce("Choose saved furniture first.");
    return;
  } // closes missing library-add name branch

  try {
    const data = await readFurnitureLibraryItem(name);
    const obj = createPlacedObject(data.furniture, name);

    state.objects.push(obj);
    state.selectedId = obj.id;
    setEditorFurniture(obj);
    renderObjects();
    announce("Added a copy of " + name + " to the current layout.");
  } catch (error) {
    announce(error.message);
  } // closes library-add try/catch
} // closes addLibraryFurnitureToLayout

async function saveFurnitureLibrary(forceSaveAs = false) {
  const name = byId("furnitureLibraryName").value.trim();

  if (!name) {
    announce("Enter a furniture library name.");
    byId("furnitureLibraryName").focus();
    return;
  } // closes missing furniture save name branch

  if (forceSaveAs) {
    state.loadedFurnitureName = null;
  } // closes furniture force-save-as branch

  try {
    await storePut(FURNITURE_STORE, {
      name: name,
      modifiedAt: new Date().toISOString(),
      data: furnitureLibraryData(name)
    }); // closes furniture record

    state.loadedFurnitureName = name;
    await refreshFurnitureLibrary(name);
    announce("Saved reusable furniture " + name + " on this device. Existing layout copies were not changed.");
  } catch (error) {
    announce(error.message);
  } // closes furniture save try/catch
} // closes saveFurnitureLibrary

async function saveAsFurnitureLibrary() {
  const proposed = byId("furnitureLibraryName").value.trim() || byId("labelInput").value.trim() || "Furniture";
  const name = window.prompt("Save furniture as:", proposed);

  if (name === null) {
    return;
  } // closes cancelled furniture Save As branch

  byId("furnitureLibraryName").value = name.trim();
  await saveFurnitureLibrary(true);
} // closes saveAsFurnitureLibrary

function captureSelectedFurniture() {
  const obj = objectById(state.selectedId);

  if (!obj) {
    announce("Select furniture in the current layout first.");
    return;
  } // closes no selected capture branch

  setEditorFurniture(obj);
  byId("furnitureLibraryName").value = obj.label;
  state.loadedFurnitureName = null;
  announce("Captured " + obj.label + " into the editor. Use Save furniture as to make an independent reusable item.");
} // closes captureSelectedFurniture

async function deleteFurnitureLibrary() {
  const name = byId("furnitureLibrarySelect").value;

  if (!name) {
    announce("Choose saved furniture to delete.");
    return;
  } // closes missing furniture delete name branch

  if (!window.confirm("Delete reusable furniture '" + name + "' from this device? Existing copies in saved configurations remain.")) {
    return;
  } // closes furniture delete confirmation branch

  try {
    await storeDelete(FURNITURE_STORE, name);

    if (state.loadedFurnitureName === name) {
      state.loadedFurnitureName = null;
    } // closes deleted loaded furniture branch

    await refreshFurnitureLibrary();
    announce("Deleted reusable furniture " + name + ". Existing layout copies were not changed.");
  } catch (error) {
    announce(error.message);
  } // closes furniture delete try/catch
} // closes deleteFurnitureLibrary

function safeFileName(value) {
  const cleaned = String(value || "planner-data")
    .trim()
    .replace(/[^a-z0-9 _.-]+/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return cleaned || "planner-data";
} // closes safeFileName

function downloadJson(fileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], {
    type: "application/json"
  }); // closes download Blob options
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000); // closes download URL cleanup callback
} // closes downloadJson

async function exportSelectedConfiguration() {
  const name = byId("configurationSelect").value || state.loadedConfigName;

  if (!name) {
    announce("Choose a saved configuration to export.");
    return;
  } // closes missing configuration export name branch

  const record = await storeGet(CONFIG_STORE, name);

  if (!record) {
    announce("Configuration was not found.");
    return;
  } // closes missing configuration export record branch

  downloadJson(safeFileName(name) + ".rowan-layout.json", record.data);
  announce("Exported configuration " + name + ".");
} // closes exportSelectedConfiguration

async function exportSelectedFurniture() {
  const name = byId("furnitureLibrarySelect").value || state.loadedFurnitureName;

  if (!name) {
    announce("Choose saved furniture to export.");
    return;
  } // closes missing furniture export name branch

  const record = await storeGet(FURNITURE_STORE, name);

  if (!record) {
    announce("Furniture item was not found.");
    return;
  } // closes missing furniture export record branch

  downloadJson(safeFileName(name) + ".rowan-furniture.json", record.data);
  announce("Exported reusable furniture " + name + ".");
} // closes exportSelectedFurniture

async function readJsonFile(file) {
  const text = await file.text();

  return JSON.parse(text);
} // closes readJsonFile

async function importConfigurationFile(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  } // closes missing configuration import file branch

  try {
    const raw = await readJsonFile(file);
    const data = migrateConfig(raw);
    const name = String(data.name || file.name.replace(/\.json$/i, "") || "Imported configuration");

    data.name = name;

    await storePut(CONFIG_STORE, {
      name: name,
      modifiedAt: new Date().toISOString(),
      data: data
    }); // closes imported configuration record

    await refreshConfigurations(name);
    announce("Imported configuration " + name + " onto this device.");
  } catch (error) {
    announce("Could not import configuration: " + error.message);
  } // closes configuration import try/catch

  event.target.value = "";
} // closes importConfigurationFile

async function importFurnitureFile(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  } // closes missing furniture import file branch

  try {
    const raw = await readJsonFile(file);
    const data = normalizeFurnitureLibraryData(raw);
    const name = String(data.name || data.furniture.label || "Imported furniture");

    data.name = name;

    await storePut(FURNITURE_STORE, {
      name: name,
      modifiedAt: new Date().toISOString(),
      data: data
    }); // closes imported furniture record

    await refreshFurnitureLibrary(name);
    announce("Imported reusable furniture " + name + " onto this device.");
  } catch (error) {
    announce("Could not import furniture: " + error.message);
  } // closes furniture import try/catch

  event.target.value = "";
} // closes importFurnitureFile

async function exportFullBackup() {
  const configurations = await storeGetAll(CONFIG_STORE);
  const furniture = await storeGetAll(FURNITURE_STORE);

  const backup = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    configurations: configurations.map(function (record) {
      return record.data;
    }), // closes backup configuration map
    furniture: furniture.map(function (record) {
      return record.data;
    }) // closes backup furniture map
  }; // closes backup object

  const datePart = new Date().toISOString().slice(0, 10);

  downloadJson("rowan-floor-planner-backup-" + datePart + ".json", backup);
  announce("Exported full device backup with " + configurations.length + " configurations and " + furniture.length + " furniture items.");
} // closes exportFullBackup

async function importFullBackup(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  } // closes missing backup file branch

  try {
    const backup = await readJsonFile(file);

    if (!backup || backup.format !== BACKUP_FORMAT || Number(backup.schemaVersion) !== BACKUP_SCHEMA_VERSION) {
      throw new Error("This is not a supported Floor Planner device backup.");
    } // closes unsupported backup branch

    const configurations = Array.isArray(backup.configurations) ? backup.configurations : [];
    const furniture = Array.isArray(backup.furniture) ? backup.furniture : [];

    for (const rawConfig of configurations) {
      const data = migrateConfig(rawConfig);
      const name = String(data.name || "Imported configuration");

      await storePut(CONFIG_STORE, {
        name: name,
        modifiedAt: new Date().toISOString(),
        data: data
      }); // closes restored configuration record
    } // closes backup configuration restore loop

    for (const rawFurniture of furniture) {
      const data = normalizeFurnitureLibraryData(rawFurniture);
      const name = String(data.name || data.furniture.label || "Imported furniture");

      await storePut(FURNITURE_STORE, {
        name: name,
        modifiedAt: new Date().toISOString(),
        data: data
      }); // closes restored furniture record
    } // closes backup furniture restore loop

    await Promise.all([
      refreshConfigurations(),
      refreshFurnitureLibrary()
    ]);

    announce("Restored " + configurations.length + " configurations and " + furniture.length + " furniture items onto this device.");
  } catch (error) {
    announce("Could not restore backup: " + error.message);
  } // closes backup import try/catch

  event.target.value = "";
} // closes importFullBackup

async function clearDeviceData() {
  if (!window.confirm("Clear ALL saved configurations and reusable furniture from this device? Export a backup first if you may need them later.")) {
    return;
  } // closes clear-data confirmation branch

  try {
    await clearAllStores();
    state.loadedConfigName = null;
    state.loadedFurnitureName = null;
    await Promise.all([
      refreshConfigurations(),
      refreshFurnitureLibrary()
    ]);
    announce("All saved planner data was cleared from this device.");
  } catch (error) {
    announce(error.message);
  } // closes clear-device-data try/catch
} // closes clearDeviceData

function wireButton(primaryId, mobileId, handler) {
  byId(primaryId).addEventListener("click", handler);

  if (mobileId) {
    byId(mobileId).addEventListener("click", handler);
  } // closes optional mobile-button branch
} // closes wireButton

byId("loadConfiguration").addEventListener("click", loadConfiguration);
wireButton("saveConfiguration", "mobileSave", function () {
  saveConfiguration(false);
}); // closes configuration save wire callback
byId("saveAsConfiguration").addEventListener("click", saveAsConfiguration);
byId("deleteConfiguration").addEventListener("click", deleteConfiguration);
byId("exportConfiguration").addEventListener("click", exportSelectedConfiguration);
byId("importConfiguration").addEventListener("change", importConfigurationFile);

wireButton("addLibraryFurniture", "mobileLibraryAdd", addLibraryFurnitureToLayout);
byId("loadFurnitureEditor").addEventListener("click", loadFurnitureIntoEditor);
byId("saveFurnitureLibrary").addEventListener("click", function () {
  saveFurnitureLibrary(false);
}); // closes furniture save click callback
byId("saveAsFurnitureLibrary").addEventListener("click", saveAsFurnitureLibrary);
byId("captureSelectedFurniture").addEventListener("click", captureSelectedFurniture);
byId("deleteFurnitureLibrary").addEventListener("click", deleteFurnitureLibrary);
byId("exportFurniture").addEventListener("click", exportSelectedFurniture);
byId("importFurniture").addEventListener("change", importFurnitureFile);

byId("addObject").addEventListener("click", addEditorFurniture);
wireButton("applyObject", "mobileApply", applyObject);
wireButton("rotateObject", "mobileRotate", rotateObject);
wireButton("duplicateObject", "mobileDuplicate", duplicateObject);
byId("deleteObject").addEventListener("click", deleteObject);

byId("exportBackup").addEventListener("click", exportFullBackup);
byId("importBackup").addEventListener("change", importFullBackup);
byId("clearDeviceData").addEventListener("click", clearDeviceData);

byId("objectList").addEventListener("change", function (event) {
  selectObject(Number(event.target.value));
}); // closes object-list change listener

["unitFeet", "unitInches", "ppfX", "ppfY"].forEach(function (id) {
  byId(id).addEventListener("change", updateGrid);
}); // closes grid-change listener registration

byId("snapToggle").addEventListener("change", updateGrid);
byId("gridToggle").addEventListener("change", updateGrid);

byId("opacitySlider").addEventListener("input", function () {
  byId("floorplan").style.opacity = String(Number(byId("opacitySlider").value) / 100);
}); // closes opacity listener

byId("calibrateX").addEventListener("click", function () {
  beginCalibration("x");
}); // closes X calibration listener

byId("calibrateY").addEventListener("click", function () {
  beginCalibration("y");
}); // closes Y calibration listener

byId("overlay").addEventListener("pointermove", onOverlayPointerMove);
byId("overlay").addEventListener("pointerup", onOverlayPointerUp);
byId("overlay").addEventListener("pointercancel", onOverlayPointerUp);
byId("overlay").addEventListener("click", onOverlayClick);
byId("stageWrap").addEventListener("keydown", onStageKeyDown);

byId("zoomRange").addEventListener("input", function () {
  setZoom(byId("zoomRange").value);
}); // closes zoom-range listener

byId("zoomIn").addEventListener("click", function () {
  setZoom(state.zoomPercent + 20);
}); // closes zoom-in listener

byId("zoomOut").addEventListener("click", function () {
  setZoom(state.zoomPercent - 20);
}); // closes zoom-out listener

byId("fitView").addEventListener("click", function () {
  setZoom(100);

  byId("stageViewport").scrollTo({
    left: 0,
    top: 0,
    behavior: "smooth"
  }); // closes fit-view scroll options
}); // closes fit-view listener

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  } // closes unsupported service-worker branch

  try {
    await navigator.serviceWorker.register("./service-worker.js", {
      scope: "./"
    }); // closes service-worker options
  } catch (error) {
    console.debug("Service worker registration failed.", error);
  } // closes service-worker registration try/catch
} // closes registerServiceWorker

async function initialize() {
  updateGrid();
  setZoom(100);

  try {
    await openDatabase();
    await Promise.all([
      refreshConfigurations(),
      refreshFurnitureLibrary()
    ]);
  } catch (error) {
    announce("Could not initialize device storage: " + error.message);
    return;
  } // closes storage initialization try/catch

  await registerServiceWorker();
  announce("Planner v5 ready. Saved layouts and furniture stay on this device.");
} // closes initialize

initialize();
