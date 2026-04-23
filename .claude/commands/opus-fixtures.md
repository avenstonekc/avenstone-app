# Opus Follow-Up: Objects/Fixtures Export from RoomPlan

You are Opus, a senior iOS + JavaScript architect. This is a follow-up to a prior session where you diagnosed the Avenstone floor plan PDF and identified that fixtures/objects were not being exported from the Swift RoomPlan plugin. This prompt gives you the missing context so you can spec the fix precisely.

---

## The App

Avenstone is a Vite + React 18 app with a Capacitor iOS bridge. The floor plan feature uses Apple's RoomPlan API (iOS 16/17) to scan rooms and export them as a PDF. The Capacitor bridge serializes Swift `[String: Any]` dicts via `CAPPluginCall.resolve(dict)`, which lands in JS as a plain object.

---

## What the Swift plugin currently does

### Single-room scan (`roomToDict` — iOS 16+)

```swift
private func roomToDict(room: CapturedRoom, name: String) -> [String: Any] {
    // ... bounding box from room.walls ...

    var wallSegments: [[String: Double]] = []
    for wall in room.walls {
        let t = wall.transform
        let cx = t.columns.3.x, cz = t.columns.3.z
        let hw = wall.dimensions.x / 2.0
        let dx = t.columns.0.x, dz = t.columns.0.z
        wallSegments.append([
            "x1": Double((cx + dx * hw - minX) * metersToFeet),
            "z1": Double((cz + dz * hw - minZ) * metersToFeet),
            "x2": Double((cx - dx * hw - minX) * metersToFeet),
            "z2": Double((cz - dz * hw - minZ) * metersToFeet),
        ])
    }

    return [
        "name": name,
        "length": fmt2(lengthFt),
        "width": fmt2(widthFt),
        "height": fmt2(heightFt),
        "sqft": Int(sqft.rounded()),
        "doors": room.doors.count,      // ← count only, no geometry
        "windows": room.windows.count,  // ← count only, no geometry
        "wallSegments": wallSegments,
        "boundingBox": ["minX": Double(minX), "maxX": Double(maxX),
                        "minZ": Double(minZ), "maxZ": Double(maxZ)],
        "simulated": false
    ]
    // NOTE: room.objects is NEVER serialized
}
```

### Multi-room scan (`structureToRooms` — iOS 17+, StructureBuilder)

```swift
private func structureToRooms(_ structure: CapturedStructure) -> [[String: Any]] {
    let m2f: Float = 3.28084

    // Compute global origin (gMinX, gMinZ) across all rooms' wall endpoints

    var result: [[String: Any]] = structure.rooms.enumerated().map { (i, room) in
        // ... per-room minX/maxX/minZ/maxZ/maxY from room.walls ...

        var wallSegs: [[String: Double]] = []
        for wall in room.walls {
            wallSegs.append(["x1":..., "z1":..., "x2":..., "z2":...])
        }

        var doorSegs: [[String: Double]] = []
        for door in room.doors {
            let t = door.transform
            let nx = t.columns.2.x, nz = t.columns.2.z   // inward normal from wall
            doorSegs.append([
                "x1":..., "z1":..., "x2":..., "z2":...,
                "nx": Double(nx), "nz": Double(nz),
                "width": Double(door.dimensions.x * m2f),
            ])
        }

        var windowSegs: [[String: Double]] = []
        for window in room.windows { windowSegs.append(["x1":..., "z1":..., "x2":..., "z2":...]) }

        var openingSegs: [[String: Double]] = []
        for opening in room.openings { openingSegs.append(["x1":..., "z1":..., "x2":..., "z2":...]) }

        return [
            "name": "Room \(i + 1)",
            "length": fmt2(lFt), "width": fmt2(wFt), "height": fmt2(hFt),
            "sqft": Int((lFt * wFt).rounded()),
            "doors": room.doors.count,
            "windows": room.windows.count,
            "wallSegments": wallSegs,
            "doorSegments": doorSegs,
            "windowSegments": windowSegs,
            "openingSegments": openingSegs,
            "worldX": Double((minX - gMinX) * m2f),   // global offset in ft
            "worldZ": Double((minZ - gMinZ) * m2f),
            "simulated": false,
            // NOTE: room.objects is NEVER serialized here either
        ] as [String: Any]
    }
    return result
}
```

---

## What the JS side receives

The JS receives `{ rooms: [...] }` from `startMultiRoomScan()`. Each room object is:

```js
{
  name: "Bedroom",
  length: 14.2,
  width: 11.5,
  height: 9.1,
  sqft: 163,
  doors: 1,       // count only
  windows: 2,     // count only
  worldX: 0,      // global offset ft (worldMode)
  worldZ: 0,
  wallSegments:   [{ x1, z1, x2, z2 }],           // room-local ft
  doorSegments:   [{ x1, z1, x2, z2, nx, nz, width }], // room-local ft
  windowSegments: [{ x1, z1, x2, z2 }],           // room-local ft
  openingSegments:[{ x1, z1, x2, z2 }],           // room-local ft
  // objects/fixtures: NOT PRESENT
}
```

The PDF renderer (`pdf.js`) currently uses `wallSegments`, `doorSegments`, `windowSegments`, `openingSegments`, and `worldX/worldZ` to draw the floor plan. Door symbols are drawn from `doorSegments` (endpoints + normal vector + width).

---

## What RoomPlan's `room.objects` actually contains

`CapturedRoom.Object` (available on iOS 16+) has:
- `category: CapturedRoom.Object.Category` — a struct-enum hybrid. You know the cases: `.sofa`, `.chair`, `.table`, `.refrigerator`, `.dishwasher`, `.washerDryer`, `.bed`, `.television`, `.toilet`, `.bathtub`, `.fireplace`, `.stove`, `.sink`, `.cabinet`, `.storage`, `.counter`, `.microwave`, `.shelving`, `.oven`, `.undefined`
- `identifier: UUID`
- `dimensions: simd_float3` — width, height, depth in **meters**
- `transform: simd_float4x4` — position + orientation in **room-local ARKit coordinates** (meters)
- `confidence: CapturedRoom.Confidence` — `.low`, `.medium`, `.high`

We do NOT know:
1. How to serialize `category` as a string — does `String(describing: obj.category)` give something useful? Is there a `.label`, `.rawValue` (Int?), or `.identifier` (String?) property?
2. Whether `transform.columns.3.x/z` gives the object's position center in room-local space correctly (same coordinate system as walls)
3. Whether `CapturedStructure` also exposes `structure.objects` (globally positioned) or only per-room via `structure.rooms[i].objects`

---

## What we need

### Task 1: Spec the Swift serialization for `objects`

Write the exact Swift code to serialize `room.objects` in `structureToRooms`, appended as `"objects": [...]` in each room dict. Each object should serialize as:

```swift
// target JS shape:
{
  "category": String,      // human-readable, e.g. "sofa", "chair"
  "width": Double,         // feet
  "height": Double,        // feet  
  "depth": Double,         // feet
  "x": Double,             // room-local center x, feet
  "z": Double,             // room-local center z, feet
  "rotationY": Double,     // radians, y-axis rotation from transform
}
```

Answer:
- How to get a reliable string from `CapturedRoom.Object.Category` (rawValue, description, custom mapping, or other)
- How to extract x/z center from `transform` in a way that's consistent with how `walls` are already handled (same coordinate origin offset)
- Whether to include `.low` confidence objects or filter them out

### Task 2: Spec the JS PDF renderer additions

Once `objects` is in the JS room data, write the `pdf.js` rendering code to draw fixtures on the floor plan. The renderer is jsPDF, unit 'pt', letter format (612×792 pts). Scale factor is `scale` pts/ft. The worldMode rendering path uses:

```js
worldOriginX + obj.x * scale   // pt x position on page
worldOriginY + obj.z * scale   // pt y position on page
```

For each object, draw:
- A filled gray rectangle representing its footprint (`width × depth` in ft → pts)
- A centered text label with the category name at 6pt font

The category string from Swift will need normalization if it comes as something like `"CapturedRoom.Object.Category.sofa"` vs `"sofa"`.

### Task 3: Answer the enum string question

The core unknown is: in Swift on iOS 16+, what is the actual string you get from `CapturedRoom.Object.Category`? Test each of:
- `String(describing: category)` 
- `category.description` (if it conforms to `CustomStringConvertible`)
- Some `.label` or `.identifier` property

If you don't know for certain, give me a safe pattern that handles unknown values gracefully (i.e., falls back to "object" rather than crashing or returning a garbage string).

---

## Write a Sonnet implementation prompt

After answering the above, write a tight implementation prompt I can give to Claude Sonnet (the model actually doing the coding). The prompt should include:
- The exact Swift `objects` serialization code to insert into `structureToRooms` and `roomToDict`
- The exact JS rendering code for `pdf.js` (worldMode path)
- The category string normalization function
- File paths: `avenstone-vite/ios/App/CapApp-SPM/Sources/CapApp-SPM/RoomPlanPlugin.swift` and `avenstone-vite/src/lib/pdf.js`
- Any caveats (e.g., single-room `roomToDict` can't include worldX/worldZ so objects would be room-local only; multi-room `structureToRooms` has the global offset so objects should be offset by `worldX/worldZ` before rendering in worldMode)
