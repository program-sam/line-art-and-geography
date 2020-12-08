////////////////////////////
// P5 and elevation stuff //
////////////////////////////

async function getElevation(coordinates) {
    const apiUrl = 'https://elevation-api.io/api/elevation'
    const key = document.getElementById('key')

    // Elevation API allows only 250 coordinates per request
    // Group coordinates in groups of 250 and send all requests
    const coordinateAoA = []
    while (coordinates.length > 0) {
        coordinateAoA.push(coordinates.splice(0, 250))
    }
    elevationPromises = coordinateAoA.map(array => {
        return fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ELEVATION_API_KEY': key
            },
            body: JSON.stringify({ points: array })
        })
    })

    // Get the responses of the elevation API and put the elevations in one long list
    // This list corresponds to the indices of the coordinates.
    const elevationResponse = await Promise.all(elevationPromises)
    const elevationAoA = await Promise.all(elevationResponse.map(value => { return value.json() }))
    elevationData = elevationAoA.map(value => value.elevations).flat(1).map(value => value.elevation)

    return elevationData
}

let ratio = 1
let compensation = 1
let height = document.getElementById('canvasheight').value
let width = height * ratio * compensation

let sketchFunction = function (p) {
    // Setting environment and 'global' variables
    let scribble = new Scribble(p)

    let detail = document.getElementById('detail').value
    let lines = document.getElementById('lines').value

    let TL = [parseFloat(document.getElementById('TL_lat').value), parseFloat(document.getElementById('TL_lng').value)]
    let BR = [parseFloat(document.getElementById('BR_lat').value), parseFloat(document.getElementById('BR_lng').value)]

    ratio = (BR[1] - TL[1]) / (TL[0] - BR[0])
    compensation = Math.cos(((TL[0] + BR[0]) / 2) * Math.PI / 180)
    height = document.getElementById('canvasheight').value
    width = height * ratio * compensation

    let elevationData = []

    p.setup = function () {
        p.createCanvas(width, height);
        p.noLoop()
    }
    p.draw = async function () {
        p.clear()
        p.strokeWeight(1)
        // If the detail or line attribute has changed, height values need to be fetched again from the API
        if (document.getElementById('detail').value != detail
            || document.getElementById('lines').value != lines
            || elevationData.length == 0) {
            detail = document.getElementById('detail').value
            lines = document.getElementById('lines').value

            // Create list of coordinates to be sampled
            const coordinateList = []
            const dHor = (BR[1] - TL[1]) / (detail - 1) // Horizontal distance between points
            const dVer = (TL[0] - BR[0]) / (lines - 1) // Vertical distance between points
            for (let i = 0; i < lines; i++) {
                for (let j = 0; j < detail; j++) {
                    coordinateList.push([TL[0] - dVer * i, TL[1] + dHor * j])
                }
            }
            elevationData = await getElevation(coordinateList)
        }

        // Get parameters from the page
        let cutoff = parseInt(document.getElementById('cutoff').value)
        let multiplier = parseInt(document.getElementById('multiplier').value)
        let drawcutoff = document.getElementById('drawcutoff').checked

        scribble.bowing = parseFloat(document.getElementById('bowing').value)
        scribble.roughness = parseFloat(document.getElementById('roughness').value)
        p.strokeWeight(parseFloat(document.getElementById('thickness').value))

        const dWidth = width / (detail - 1)
        const dHeight = height / (lines)

        // process the elevation data and apply cutoff value
        const data = elevationData.map(value => {
            if (value < cutoff) {
                return cutoff
            }
            return value
        })
        const max = Math.max(...data)
        const min = Math.min(...data)

        valueList = []
        for (let i = lines - 1; i > 0; i--) {
            // Set line color
            if (document.getElementById('randomcolors').checked){
                r = Math.random() * 255
                g = Math.random() * 255
                b = Math.random() * 255
                p.stroke(r, g, b)
            } else {
                p.stroke(document.getElementById('color').value)
            }
            for (let j = 1; j < detail; j++) {
                // Draw each individual line segment
                prevX = (j - 1) * dWidth
                prevValue = (data[(i - 1) * detail + j - 1] - min) / (max - min) * (height / 100 * multiplier)
                currX = j * dWidth
                currValue = (data[(i - 1) * detail + j] - min) / (max - min)  * (height / 100 * multiplier)

                currY = i * dHeight - currValue
                prevY = i * dHeight - prevValue

                if (j == 1){valueList.push(prevY)}
                valueList.push(currY)

                // Prevent line from overlapping previous line. Not on point yet.
                if (i < lines - 1 && j < detail - 1){
                    currYdown = height
                    prevYdown = height
                    for(let n = 1; n < lines - i; n++){
                        currYdown = valueList[valueList.length - n*detail - 1] < currYdown ? valueList[valueList.length - n*detail - 1] : currYdown
                        prevYdown = valueList[valueList.length - n*detail - 2] < prevYdown ? valueList[valueList.length - n*detail - 2] : prevYdown
                    }

                    currY = currY < currYdown ? currY : currYdown
                    prevY = prevY < prevYdown ? prevY : prevYdown
                }
                if (prevValue == 0 && currValue == 0 && !drawcutoff) { continue }
                // Draw the line using scribble
                scribble.scribbleLine(prevX, prevY, currX, currY)
            }
        }
    }

    // Add eventlisteners to buttons
    let reload = document.getElementById('reload'), reloadClone = reload.cloneNode(true);
    reload.parentNode.replaceChild(reloadClone, reload);
    document.getElementById('reload').addEventListener('click', function () { p.redraw(1); })

    var save = document.getElementById('save'), saveClone = save.cloneNode(true);
    save.parentNode.replaceChild(saveClone, save);
    document.getElementById('save').addEventListener('click', function () { p.saveCanvas('canvas', 'png'); })

    // Add eventlistener to canvas size
    document.getElementById('canvasheight').addEventListener('change', () => {
        height = document.getElementById('canvasheight').value
        width = height * ratio * compensation
        p.resizeCanvas(width, height)
    })
}

let sketch = new p5(sketchFunction, document.getElementById('canvas'))









///////////////////////
// Leaflet map stuff //
///////////////////////

const map = L.map('map', { editable: true }).setView([20.520283, -157.625901], 4);
L.tileLayer('http://a.tile.opentopomap.org/{z}/{x}/{y}.png', {noWrap: true}).addTo(map);

// Enable draw controls
L.EditControl = L.Control.extend({
    options: {
        position: 'topleft',
        callback: null,
        kind: '',
        html: ''
    },
    onAdd: function (map) {
        var container = L.DomUtil.create('div', 'leaflet-control leaflet-bar'),
            link = L.DomUtil.create('a', '', container);

        link.href = '#';
        link.title = 'Create a new ' + this.options.kind;
        link.innerHTML = this.options.html;
        L.DomEvent.on(link, 'click', L.DomEvent.stop)
            .on(link, 'click', function () {
                window.LAYER = this.options.callback.call(map.editTools);
            }, this)
        return container;
    }
});

// Add a button to draw a rectangle
L.NewRectangleControl = L.EditControl.extend({
    options: {
        position: 'topleft',
        callback: map.editTools.startRectangle,
        kind: 'rectangle',
        html: '&#9724;'
    }
});

// Add drawcontrol to map
map.addControl(new L.NewRectangleControl())

// When the end of a drawing triggers the event, update the area and redraw.
map.on('editable:vertex:dragend', ({ layer }) => {
    map.eachLayer((ly) => {
        if (ly instanceof L.Polygon && ly != layer) {
            map.removeLayer(ly)
        }
    });
    document.getElementById('TL_lat').value = layer.getBounds().getNorthWest().lat
    document.getElementById('TL_lng').value = layer.getBounds().getNorthWest().lng
    document.getElementById('BR_lat').value = layer.getBounds().getSouthEast().lat
    document.getElementById('BR_lng').value = layer.getBounds().getSouthEast().lng
    sketch.remove()
    sketch = new p5(sketchFunction, document.getElementById('canvas'))
})