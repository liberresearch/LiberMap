// Constants and Configurations
const CONFIG = {
    HONG_KONG_CENTER: [114.1095, 22.3964],
    HK80_PROJECTION: 'EPSG:2326',
    WGS84_PROJECTION: 'EPSG:4326',
    DEFAULT_ZOOM: 10.3
};

// Register HK80 projection
proj4.defs(CONFIG.HK80_PROJECTION, "+proj=tmerc +lat_0=22.31213333333333 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +datum=HK80 +units=m +no_defs");
ol.proj.proj4.register(proj4);

// Map initialization
class MapManager {
    constructor() {
        this.map = this.initializeMap();
        this.locationMarker = null;
        this.vectorSource = null;
    }

    initializeMap() {
        return new ol.Map({
            target: 'map',
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.XYZ({
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/wgs84/{z}/{x}/{y}.png'
                    })
                }),
                new ol.layer.Tile({
                    source: new ol.source.XYZ({
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/en/wgs84/{z}/{x}/{y}.png'
                    })
                })
            ],
            view: new ol.View({
                center: ol.proj.fromLonLat(CONFIG.HONG_KONG_CENTER),
                zoom: CONFIG.DEFAULT_ZOOM
            })
        });
    }

    useMyLocation() {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by this browser.');
            return;
        }

        navigator.geolocation.getCurrentPosition((position) => {
            const coords = [position.coords.longitude, position.coords.latitude];
            const transformedCoords = ol.proj.fromLonLat(coords);
            
            this.locationMarker = new ol.Feature({
                geometry: new ol.geom.Point(transformedCoords)
            });

            const iconStyle = new ol.style.Style({
                image: new ol.style.Icon({
                    src: './img/pin.png',
                    scale: 0.07,
                    anchor: [0.5, 1]
                })
            });

            this.locationMarker.setStyle(iconStyle);
            this.vectorSource = new ol.source.Vector({
                features: [this.locationMarker]
            });

            const vectorLayer = new ol.layer.Vector({
                source: this.vectorSource
            });

            this.map.addLayer(vectorLayer);
            this.animateToLocation(transformedCoords, 15);
        });
    }

    goToHome() {
        this.animateToLocation(ol.proj.fromLonLat(CONFIG.HONG_KONG_CENTER), CONFIG.DEFAULT_ZOOM);
        if (this.locationMarker && this.vectorSource) {
            this.vectorSource.removeFeature(this.locationMarker);
            this.locationMarker = null;
        }
    }

    animateToLocation(center, zoom) {
        this.map.getView().animate({
            center: center,
            zoom: zoom,
            duration: 1500
        });
    }

    addLayerToMap() {
        const inputElement = document.createElement('input');
        inputElement.type = 'file';
        inputElement.accept = '.geojson,.json';
        inputElement.onchange = this.handleFileUpload.bind(this);
        inputElement.click();
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => this.processGeoJSON(e.target.result);
        reader.onerror = (error) => {
            console.error('File reading error: ', error);
            alert('Error reading file.');
        };
        reader.readAsText(file);
    }

    processGeoJSON(content) {
        try {
            const geojson = JSON.parse(content);
            const features = new ol.format.GeoJSON().readFeatures(geojson, {
                dataProjection: CONFIG.HK80_PROJECTION,
                featureProjection: 'EPSG:3857'
            });

            const vectorSource = new ol.source.Vector({ features });
            const vectorLayer = new ol.layer.Vector({
                source: vectorSource,
                style: this.createStyleFunction()
            });

            this.map.addLayer(vectorLayer);
            this.map.getView().fit(vectorSource.getExtent(), { duration: 1500 });
        } catch (error) {
            alert('Invalid GeoJSON format.');
            console.error('Invalid GeoJSON format: ', error);
        }
    }

    createStyleFunction() {
        return (feature) => {
            const properties = feature.getProperties();
            if (properties.icon) {
                return new ol.style.Style({
                    image: new ol.style.Icon({
                        src: properties.icon,
                        scale: properties['icon-scale'] || 1,
                        anchor: [0.5, 1]
                    })
                });
            }
            return new ol.style.Style({
                fill: new ol.style.Fill({
                    color: properties.fill || 'rgba(255, 255, 255, 0.6)'
                }),
                stroke: new ol.style.Stroke({
                    color: properties.stroke || '#319FD3',
                    width: properties['stroke-width'] || 1
                })
            });
        };
    }
}

// UI Manager
class UIManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.createButtons();
    }

    createButtons() {
        this.createButton('mylocation-button', './img/myLocation.png', 'My Location', 
            () => this.mapManager.useMyLocation());
        this.createButton('home-button', './img/home.png', 'Home', 
            () => this.mapManager.goToHome());
        this.createButton('addLayer-button', './img/addLayer.png', 'Add Layer', 
            () => this.mapManager.addLayerToMap());
    }

    createButton(id, src, alt, onClick) {
        const button = document.createElement('img');
        button.id = id;
        button.src = src;
        button.alt = alt;
        button.onclick = onClick;
        document.body.appendChild(button);
    }

    adjustButtonPositions() {
        const zoomInButton = document.querySelector('.ol-zoom-in');
        const zoomOutButton = document.querySelector('.ol-zoom-out');
        
        if (!zoomInButton || !zoomOutButton) return;

        const buttons = [
            document.getElementById('mylocation-button'),
            document.getElementById('home-button'),
            document.getElementById('addLayer-button')
        ];

        const buttonWidth = (zoomOutButton.getBoundingClientRect().width * 0.8) + 'px';
        const buttonHeight = (zoomOutButton.getBoundingClientRect().height * 0.8) + 'px';

        let previousBottom = zoomOutButton.getBoundingClientRect().bottom;

        buttons.forEach(button => {
            button.style.width = buttonWidth;
            button.style.height = buttonHeight;
            button.style.top = (previousBottom + 1) + 'px';
            previousBottom = button.getBoundingClientRect().bottom;
        });
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    const mapManager = new MapManager();
    const uiManager = new UIManager(mapManager);
    setTimeout(() => uiManager.adjustButtonPositions(), 100);
});
