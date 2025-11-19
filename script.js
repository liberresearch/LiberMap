const CONFIG = {
    HONG_KONG_CENTER: [114.1095, 22.3964],
    HK80_PROJECTION: 'EPSG:2326',
    WGS84_PROJECTION: 'EPSG:4326',
    DEFAULT_ZOOM: 10.3,
};

proj4.defs(CONFIG.HK80_PROJECTION, "+proj=tmerc +lat_0=22.31213333333333 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +datum=HK80 +units=m +no_defs");
ol.proj.proj4.register(proj4);

class MapManager {
    constructor() {
        this.isMobile = window.innerWidth <= 768 ||
            navigator.userAgent.match(/Android/i) ||
            navigator.userAgent.match(/iPhone|iPad|iPod/i);
        this.basemap = null;
        this.map = this.initializeMap();
        this.setupMapAccessibility();
        this.initializeComponents();
        this.basemapLayers = [];
        this.currentBasemapId = 'Google_Satellite';
        this.initializeBasemapSwitcher();
        this.highlightedFeature = null;
        this.originalStyle = null;
    }


	splitBilingualName(name) {
		// Find the boundary between Chinese and English: the first "] [" sequence
		const splitIndex = name.indexOf('] [');
		if (splitIndex > -1) {
			// Chinese part: up to and including the ] before the space
			const chinese = name.substring(0, splitIndex + 1);
			// English part: from after the space to end
			const english = name.substring(splitIndex + 2);
			return `${chinese}
			${english}`;
		}
		// Fallback: return as-is if no boundary found (or wrap if single-line needed)
		return name.replace(/\s+/g, ' ');  // Clean up extra spaces as bonus
	}
	
    setupOptimizedEventHandlers() {
        const debounce = (func, delay) => {
            let timeout;
            return function () {
                const context = this;
                const args = arguments;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), delay);
            };
        };

        this.map.on('pointermove', debounce((event) => {
            const pixel = this.map.getEventPixel(event.originalEvent);
            const hit = this.map.hasFeatureAtPixel(pixel);
            this.map.getTargetElement().style.cursor = hit ? 'pointer' : '';
        }, 50));

        this.map.on('movestart', () => {
            this.map.getLayers().forEach(layer => {
                if (layer instanceof ol.layer.Vector) {
                    layer.setRenderBuffer(0);
                }
            });
        });

        this.map.on('moveend', () => {
            this.map.getLayers().forEach(layer => {
                if (layer instanceof ol.layer.Vector) {
                    layer.setRenderBuffer(100);
                }
            });
        });
    }

    cleanupUnusedResources() {
        if (this.activeLayers.size > 5) {
            const layerEntries = Array.from(this.activeLayers.entries());
            const oldestLayers = layerEntries.slice(0, layerEntries.length - 5);

            oldestLayers.forEach(([url, layerInfo]) => {
                this.map.removeLayer(layerInfo.layer);
                this.activeLayers.delete(url);
                if (layerInfo.button) {
                    layerInfo.button.textContent = '+';
                    layerInfo.button.className = 'layer-toggle-button add';
                }
            });

            this.updateLegend(document.querySelector('.legend-content'));
        }
    }

    setupMapAccessibility() {
        this.map.getTargetElement().setAttribute('role', 'application');
        this.map.getTargetElement().setAttribute('aria-label', 'Interactive map of Hong Kong');
        this.activeLayers = new Map();
        this.locationMarker = null;
        this.vectorSource = null;
    }

    initializeComponents() {
        this.initializeSearchTool();
        this.createLegendPanel();
        this.createPopupInfo();
        this.createLiberDataPanel();
    }

    initializeMap() {
        this.basemap = new ol.layer.Group({
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.XYZ({
                        url: 'https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
                        attribution: '© Google Maps'
                    })
                })
            ]
        });

        const map = new ol.Map({
            target: 'map',
            layers: [this.basemap],
            view: new ol.View({
                center: ol.proj.fromLonLat(CONFIG.HONG_KONG_CENTER),
                zoom: CONFIG.DEFAULT_ZOOM
            }),
            controls: [
                new ol.control.Zoom()
            ]
        });

        if (this.isMobile) {
            const controls = map.getControls().getArray();
            const controlsToKeep = controls.filter(control =>
                control instanceof ol.control.Zoom
            );
            map.getControls().clear();
            controlsToKeep.forEach(control => {
                map.addControl(control);
            });
        }

        return map;
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

            setTimeout(() => {
                if (this.vectorSource && this.locationMarker) {
                    this.vectorSource.removeFeature(this.locationMarker);
                    this.map.removeLayer(vectorLayer);
                    this.locationMarker = null;
                    this.vectorSource = null;
                }
            }, 3000);
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

    printMap() {
        const printContainer = document.createElement('div');
        printContainer.style.width = '1200px'; // Increased resolution
        printContainer.style.height = '900px';
        printContainer.style.position = 'absolute';
        printContainer.style.left = '-9999px'; // Render off-screen
        document.body.appendChild(printContainer);

        const basemapLayers = this.basemap.getLayers().getArray();

        // Create a new map for printing
        const printMap = new ol.Map({
            target: printContainer,
            layers: [
                ...basemapLayers.map((layer, index) => {
                    const source = layer.getSource();
                    return new ol.layer.Tile({
                        source: new ol.source.XYZ({
                            url: source.getUrls() ? source.getUrls()[0] : '',
                            crossOrigin: 'anonymous',
                            attributions: source.getAttributions()
                        }),
                        zIndex: -100 + index
                    });
                }),
                ...Array.from(this.activeLayers.values()).map((info, index) => {
                    const source = info.layer.getSource();
                    const features = source.getFeatures().map(f => {
                        const clonedFeature = f.clone();
                        // Ensure style is preserved
                        const originalStyle = f.getStyle() || info.layer.getStyle();
                        if (originalStyle) {
                            clonedFeature.setStyle(originalStyle);
                        }
                        return clonedFeature;
                    });
                    return new ol.layer.Vector({
                        source: new ol.source.Vector({ features }),
                        style: info.layer.getStyle(),
                        zIndex: 1000 + index
                    });
                })
            ],
            view: new ol.View({
                center: this.map.getView().getCenter(),
                zoom: this.map.getView().getZoom(),
                rotation: this.map.getView().getRotation(),
                projection: this.map.getView().getProjection()
            })
        });

        // Force render and wait for all layers to be ready
        printMap.renderSync();

        // Use setTimeout to ensure vector layers are fully rendered
        setTimeout(() => {
            const mapCanvas = printContainer.querySelector('canvas');
            if (mapCanvas) {
                try {
                    const dataUrl = mapCanvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.download = 'map_export.png';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } catch (error) {
                    console.error('Error generating map image:', error);
                    alert('Failed to generate map image. Please try again.');
                }
            } else {
                console.error('Canvas not found for printing');
                alert('Failed to generate map image. Canvas not found.');
            }

            // Clean up
            printMap.setTarget(null);
            document.body.removeChild(printContainer);
        }, 1000); // Delay to allow vector layers to render
    }

    initializeBasemapSwitcher() {
        this.basemapConfigs = {
            topographic_en: {
                name: 'Topographic - Eng (Gov)',
                thumbnail: 'img/topographic.png',
                layers: [
                    {
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/wgs84/{z}/{x}/{y}.png',
                        attribution: 'Lands Department © The Government of the Hong Kong SAR'
                    },
                    {
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/en/wgs84/{z}/{x}/{y}.png',
                        attribution: 'Lands Department © The Government of the Hong Kong SAR'
                    }
                ]
            },
            topographic_tc: {
                name: 'Topographic - 中文 (Gov)',
                thumbnail: 'img/topographic.png',
                layers: [
                    {
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/wgs84/{z}/{x}/{y}.png',
                        attribution: 'Lands Department © The Government of the Hong Kong SAR'
                    },
                    {
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/tc/wgs84/{z}/{x}/{y}.png',
                        attribution: 'Lands Department © The Government of the Hong Kong SAR'
                    }
                ]
            },
            imagery_en: {
                name: 'Imagery - Eng (Gov)',
                thumbnail: 'img/imagery.png',
                layers: [
                    {
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/imagery/wgs84/{z}/{x}/{y}.png',
                        attribution: 'Lands Department © The Government of the Hong Kong SAR'
                    },
                    {
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/en/wgs84/{z}/{x}/{y}.png',
                        attribution: 'Lands Department © The Government of the Hong Kong SAR'
                    }
                ]
            },
            imagery_tc: {
                name: 'Imagery - 中文 (Gov)',
                thumbnail: 'img/imagery.png',
                layers: [
                    {
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/imagery/wgs84/{z}/{x}/{y}.png',
                        attribution: 'Lands Department © The Government of the Hong Kong SAR'
                    },
                    {
                        url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/tc/wgs84/{z}/{x}/{y}.png',
                        attribution: 'Lands Department © The Government of the Hong Kong SAR'
                    }
                ]
            },
            greyscale: {
                name: 'Carto Light (Grayscale)',
                thumbnail: 'img/carto-light.png',
                layers: [
                    {
                        url: 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                        attribution: '© CARTO'
                    }
                ]
            },
            OSM: {
                name: 'Open Street Map',
                thumbnail: 'img/osm.png',
                layers: [
                    {
                        url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '© OpenStreetMap contributors'
                    }
                ]
            },
            Google_Satellite: {
                name: 'Google Satellite',
                thumbnail: 'img/google-satellite.png',
                layers: [
                    {
                        url: 'https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
                        attribution: '© Google Maps'
                    }
                ]
            }
        };

        this.applyBasemap(this.currentBasemapId);

        const basemapButton = this.createButton(
            'basemap-button',
            'img/basemap.png',
            'Change Basemap',
            () => {
                const dropdown = document.getElementById('basemap-dropdown');
                if (dropdown) {
                    const isVisible = dropdown.style.display !== 'none';
                    dropdown.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible) {
                        const buttonRect = basemapButton.getBoundingClientRect();
                        dropdown.style.position = 'absolute';
                        dropdown.style.left = `${buttonRect.right + 10}px`;
                        dropdown.style.top = `${buttonRect.top}px`;
                    }
                }
            }
        );

        document.body.appendChild(basemapButton);

        const dropdown = document.createElement('div');
        dropdown.id = 'basemap-dropdown';
        dropdown.className = 'basemap-dropdown';
        dropdown.style.display = 'none';

        Object.keys(this.basemapConfigs).forEach(id => {
            const option = this.basemapConfigs[id];
            const optionElement = document.createElement('div');
            optionElement.className = 'basemap-option';

            const thumbnail = document.createElement('div');
            thumbnail.className = 'basemap-thumbnail';
            thumbnail.style.backgroundImage = `url(${option.thumbnail})`;
            optionElement.appendChild(thumbnail);

            const name = document.createElement('span');
            name.textContent = option.name;
            optionElement.appendChild(name);

            if (id === this.currentBasemapId) {
                optionElement.classList.add('active');
            }

            optionElement.addEventListener('click', () => {
                this.switchBasemap(id);
                dropdown.style.display = 'none';
                document.querySelectorAll('.file-item-container').forEach(container => {
					const fileName = container.querySelector('.file-name');
					if (fileName) {
						// Temporarily show to measure
						container.style.minHeight = 'auto';
						const measuredHeight = fileName.scrollHeight + 16; // + padding
						container.style.minHeight = `${measuredHeight}px`;
					}
				});
                optionElement.classList.add('active');
            });

            dropdown.appendChild(optionElement);
        });

        document.addEventListener('click', (e) => {
            if (!basemapButton.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        document.body.appendChild(dropdown);
    }

    applyBasemap(basemapId) {
        const config = this.basemapConfigs[basemapId];
        if (!config) return;

        if (this.basemap) {
            this.map.removeLayer(this.basemap);
        }

        const newBasemapLayers = [];

        config.layers.forEach((layerConfig, index) => {
            let layer;

            if (layerConfig.type === 'osm') {
                layer = new ol.layer.Tile({
                    source: new ol.source.OSM(),
                    className: layerConfig.className || '',
                    zIndex: -100 + index
                });
            } else {
                layer = new ol.layer.Tile({
                    source: new ol.source.XYZ({
                        url: layerConfig.url,
                        attributions: layerConfig.attribution || ''
                    }),
                    zIndex: -100 + index
                });
            }

            newBasemapLayers.push(layer);
        });

        this.basemap = new ol.layer.Group({
            layers: newBasemapLayers
        });

        this.map.addLayer(this.basemap);
        this.basemapLayers = newBasemapLayers;
    }

    switchBasemap(basemapId) {
        if (!this.basemapConfigs[basemapId] || basemapId === this.currentBasemapId) return;

        this.applyBasemap(basemapId);
        this.currentBasemapId = basemapId;

        console.log(`Switched basemap to: ${basemapId}`);

        const event = new CustomEvent('basemapChanged', {
            detail: {
                basemapId: basemapId,
                basemapLayers: this.basemapLayers
            }
        });
        document.dispatchEvent(event);
    }

    getCurrentBasemapLayers() {
        return this.basemapLayers;
    }

    getCurrentBasemapId() {
        return this.currentBasemapId;
    }

    initializeSearchTool() {
        const searchContainer = document.createElement('div');
        searchContainer.id = 'search-container';
        searchContainer.className = 'search-container';

        const dropdownToggle = document.createElement('div');
        dropdownToggle.className = 'search-dropdown-toggle';
        dropdownToggle.innerHTML = '▼';
        dropdownToggle.setAttribute('role', 'button');
        dropdownToggle.setAttribute('aria-label', 'Toggle search engines');
        dropdownToggle.setAttribute('tabindex', '0');

        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'search-dropdown-menu';
        dropdownMenu.style.display = 'none';

        const engines = [
            { id: 'google', name: 'Google Places' },
            { id: 'locationSearch', name: 'Location Search API' }
        ];
        engines.forEach(engine => {
            const option = document.createElement('div');
            option.className = 'search-engine-option';
            option.textContent = engine.name;
            option.setAttribute('data-engine', engine.id);
            option.onclick = () => {
                setActiveEngine(engine.id);
                dropdownMenu.style.display = 'none';
            };
            dropdownMenu.appendChild(option);
        });

        const inputContainer = document.createElement('div');
        inputContainer.className = 'search-input-container';

        const googleSearchInput = document.createElement('input');
        googleSearchInput.id = 'google-search-input';
        googleSearchInput.className = 'search-input';
        googleSearchInput.type = 'text';
        googleSearchInput.placeholder = 'Search Google Places...';

        const locationSearchInput = document.createElement('input');
        locationSearchInput.id = 'location-search-input';
        locationSearchInput.className = 'search-input';
        locationSearchInput.type = 'text';
        locationSearchInput.placeholder = 'Search Location Search API...';
        locationSearchInput.style.display = 'none';

        inputContainer.appendChild(googleSearchInput);
        inputContainer.appendChild(locationSearchInput);
        searchContainer.appendChild(dropdownToggle);
        searchContainer.appendChild(inputContainer);
        document.body.appendChild(searchContainer);
        document.body.appendChild(dropdownMenu);

        const resultContainer = document.createElement('div');
        resultContainer.className = 'search-results-container';
        resultContainer.style.display = 'none';
        document.body.appendChild(resultContainer);

        const pinMarkerSource = new ol.source.Vector();
        const pinMarkerLayer = new ol.layer.Vector({
            source: pinMarkerSource,
            zIndex: 1000
        });
        this.map.addLayer(pinMarkerLayer);

        let pinTimer = null;

        const addPinMarker = (coordinates) => {
            pinMarkerSource.clear();
            if (pinTimer) {
                clearTimeout(pinTimer);
            }

            const marker = new ol.Feature({
                geometry: new ol.geom.Point(coordinates)
            });

            const markerStyle = new ol.style.Style({
                image: new ol.style.Icon({
                    src: 'img/pin.png',
                    anchor: [0.5, 1],
                    scale: 0.05
                })
            });

            marker.setStyle(markerStyle);
            pinMarkerSource.addFeature(marker);

            pinTimer = setTimeout(() => {
                pinMarkerSource.clear();
                pinTimer = null;
            }, 5000);
        };

        dropdownToggle.onclick = () => {
            const isVisible = dropdownMenu.style.display !== 'none';
            dropdownMenu.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                const rect = dropdownToggle.getBoundingClientRect();
                dropdownMenu.style.left = `${rect.left}px`;
                dropdownMenu.style.top = `${rect.bottom + window.scrollY}px`;
            }
        };

        dropdownToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                dropdownToggle.click();
            }
        });

        const setActiveEngine = (engineId) => {
            googleSearchInput.style.display = 'none';
            locationSearchInput.style.display = 'none';

            if (engineId === 'google') {
                googleSearchInput.style.display = 'block';
                dropdownToggle.setAttribute('aria-label', 'Google Places (click to change)');
            } else if (engineId === 'locationSearch') {
                locationSearchInput.style.display = 'block';
                dropdownToggle.setAttribute('aria-label', 'Location Search API (click to change)');
            }

            resultContainer.style.display = 'none';
            resultContainer.innerHTML = '';

            pinMarkerSource.clear();
            if (pinTimer) {
                clearTimeout(pinTimer);
                pinTimer = null;
            }
        };

        let searchBox;
        const initGoogleSearch = () => {
            searchBox = new google.maps.places.SearchBox(googleSearchInput);
            searchBox.addListener('places_changed', () => {
                const places = searchBox.getPlaces();
                if (places.length === 0) return;

                const place = places[0];
                const coordinates = [place.geometry.location.lng(), place.geometry.location.lat()];
                const transformedCoords = ol.proj.fromLonLat(coordinates);

                addPinMarker(transformedCoords);

                this.map.getView().animate({
                    center: transformedCoords,
                    zoom: 15,
                    duration: 1000
                });
            });
        };

        locationSearchInput.addEventListener('input', () => {
            const query = locationSearchInput.value;
            if (query.length < 2) {
                resultContainer.style.display = 'none';
                return;
            }
            fetchLocationSearch(query);
        });

        const fetchLocationSearch = query => {
            const url = `https://geodata.gov.hk/gs/api/v1.0.0/locationSearch?q=${encodeURIComponent(query)}`;
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    const results = data.slice(0, 5);
                    resultContainer.innerHTML = '';

                    if (results.length === 0) {
                        resultContainer.style.display = 'none';
                        return;
                    }

                    results.forEach(result => {
                        const resultItem = document.createElement('div');
                        resultItem.className = 'search-result-item';
                        resultItem.textContent = result.nameZH;
                        resultItem.addEventListener('click', () => {
                            const hk1980Projection = 'EPSG:2326';
                            const mapProjection = this.map.getView().getProjection().getCode();
                            const x = result.x;
                            const y = result.y;

                            const transformedCoords = ol.proj.transform([x, y], hk1980Projection, mapProjection);

                            addPinMarker(transformedCoords);

                            this.map.getView().animate({
                                center: transformedCoords,
                                zoom: 15,
                                duration: 1000
                            });

                            resultContainer.style.display = 'none';
                            locationSearchInput.value = result.nameZH;
                        });
                        resultContainer.appendChild(resultItem);
                    });

                    const rect = locationSearchInput.getBoundingClientRect();
                    resultContainer.style.left = `${rect.left}px`;
                    resultContainer.style.top = `${rect.bottom + window.scrollY}px`;
                    resultContainer.style.width = `${rect.width}px`;
                    resultContainer.style.display = 'block';
                })
                .catch(error => console.error('Error fetching location search results:', error));
        };

        initGoogleSearch();
        setActiveEngine('google');

        document.addEventListener('click', (e) => {
            if (!dropdownToggle.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.style.display = 'none';
            }
            if (!searchContainer.contains(e.target) && !resultContainer.contains(e.target)) {
                resultContainer.style.display = 'none';
            }
        });
    }

    addLayerToMap() {
        const inputElement = document.createElement('input');
        inputElement.type = 'file';
        inputElement.accept = '.kml,.geojson,.json';
        inputElement.onchange = this.handleFileUpload.bind(this);
        inputElement.click();
    }

    processKML(content, fileName) {
        try {
            const features = new ol.format.KML({
                extractStyles: true,
                showPointNames: false
            }).readFeatures(content, {
                featureProjection: 'EPSG:3857'
            });

            const vectorSource = new ol.source.Vector({ features });
            const vectorLayer = new ol.layer.Vector({
                source: vectorSource,
                style: this.createStyleFunction()
            });

            vectorLayer.setZIndex(1000 + this.activeLayers.size);

            this.map.addLayer(vectorLayer);
            this.activeLayers.set(fileName, {
                layer: vectorLayer,
                button: null
            });

            const legendContent = document.querySelector('.legend-content');
            if (legendContent) {
                this.updateLegend(legendContent);
            }

            this.map.getView().fit(vectorSource.getExtent(), { duration: 1500 });
        } catch (error) {
            console.error('KML processing error:', error);
            alert('Error processing KML file.');
        }
    }

    processGeoJSON(content, fileName) {
        try {
            const features = new ol.format.GeoJSON().readFeatures(content, {
                featureProjection: 'EPSG:3857'
            });

            const vectorSource = new ol.source.Vector({ features });
            const vectorLayer = new ol.layer.Vector({
                source: vectorSource,
                style: this.createStyleFunction()
            });

            vectorLayer.setZIndex(1000 + this.activeLayers.size);

            this.map.addLayer(vectorLayer);
            this.activeLayers.set(fileName, {
                layer: vectorLayer,
                button: null
            });

            const legendContent = document.querySelector('.legend-content');
            if (legendContent) {
                this.updateLegend(legendContent);
            }

            this.map.getView().fit(vectorSource.getExtent(), { duration: 1500 });
        } catch (error) {
            console.error('GeoJSON processing error:', error);
            alert('Error processing GeoJSON file.');
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.currentFileName = file.name;
        const fileExtension = file.name.split('.').pop().toLowerCase();

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            if (fileExtension === 'kml') {
                this.processKML(content, file.name);
            } else if (fileExtension === 'geojson' || fileExtension === 'json') {
                this.processGeoJSON(content, file.name);
            } else {
                alert('Unsupported file format. Please upload a KML or GeoJSON file.');
            }
        };
        reader.onerror = (error) => {
            console.error('File reading error: ', error);
            alert('Error reading file.');
        };
        reader.readAsText(file);
    }

    createStyleFunction() {
        return (feature) => {
            const kmlStyleFunc = feature.getStyleFunction();
            if (kmlStyleFunc) {
                let kmlStyles = kmlStyleFunc(feature);
                if (!kmlStyles) return null;
                let stylesArray = Array.isArray(kmlStyles) ? kmlStyles : [kmlStyles];
                let updatedStyles = stylesArray.map(s => {
                    if (!s) return null;
                    let style = s.clone();
                    style.setText(null);
                    return style;
                }).filter(s => s !== null);

                if (updatedStyles.length === 0) {
                    return new ol.style.Style({
                        fill: new ol.style.Fill({ color: 'rgba(51, 153, 204, 0.7)' }),
                        stroke: new ol.style.Stroke({ color: '#3399CC', width: 2 }),
                        text: null
                    });
                }
                return updatedStyles.length === 1 ? updatedStyles[0] : updatedStyles;
            }

            const geomType = feature.getGeometry().getType();
            if (geomType === 'Point') {
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 5,
                        fill: new ol.style.Fill({ color: '#3399CC' }),
                        stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
                    }),
                    text: null
                });
            } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: '#3399CC', width: 2 }),
                    text: null
                });
            } else {
                return new ol.style.Style({
                    fill: new ol.style.Fill({ color: 'rgba(51, 153, 204, 0.7)' }),
                    stroke: new ol.style.Stroke({ color: '#3399CC', width: 2 }),
                    text: null
                });
            }
        };
    }

    convertToRGBA(color, opacity) {
        if (color.startsWith('rgba')) return color;
        if (color.startsWith('rgb')) {
            return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
        }
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    highlightFeature(feature) {
        if (this.highlightedFeature && this.originalStyle) {
            this.highlightedFeature.setStyle(this.originalStyle);
        }

        this.highlightedFeature = feature;
        this.originalStyle = feature.getStyle();

        const geomType = feature.getGeometry().getType();
        let highlightStyle;

        if (geomType === 'Point' || geomType === 'MultiPoint') {
            highlightStyle = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 7,
                    fill: new ol.style.Fill({ color: 'rgba(255, 255, 0, 0.7)' }),
                    stroke: new ol.style.Stroke({ color: '#ff0', width: 3 })
                })
            });
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
            highlightStyle = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#ff0',
                    width: 4
                })
            });
        } else {
            highlightStyle = new ol.style.Style({
                fill: new ol.style.Fill({ color: 'rgba(255, 255, 0, 0.3)' }),
                stroke: new ol.style.Stroke({ color: '#ff0', width: 3 })
            });
        }

        feature.setStyle(highlightStyle);
    }

    clearHighlight() {
        if (this.highlightedFeature && this.originalStyle) {
            this.highlightedFeature.setStyle(this.originalStyle);
            this.highlightedFeature = null;
            this.originalStyle = null;
        }
    }

    createPopupInfo() {
        const overlayContainerElement = document.createElement('div');
        overlayContainerElement.className = 'popup-container';
        overlayContainerElement.style.display = 'none';
        document.body.appendChild(overlayContainerElement);

        const popupHeader = document.createElement('div');
        popupHeader.className = 'popup-header';
        const popupTitle = document.createElement('div');
        popupTitle.className = 'popup-title';
        popupHeader.appendChild(popupTitle);

        const featureCounter = document.createElement('div');
        featureCounter.className = 'popup-feature-counter';
        featureCounter.style.fontSize = '14px';
        featureCounter.style.color = '#666';
        popupHeader.appendChild(featureCounter);

        const prevButton = document.createElement('div');
        prevButton.className = 'popup-prev-button';
        prevButton.innerHTML = '<';
        prevButton.style.cursor = 'pointer';
        prevButton.style.fontSize = '20px';
        prevButton.style.color = '#666';
        prevButton.style.width = '24px';
        prevButton.style.height = '24px';
        prevButton.style.display = 'flex';
        prevButton.style.alignItems = 'center';
        prevButton.style.justifyContent = 'center';
        prevButton.style.borderRadius = '50%';
        prevButton.setAttribute('aria-label', 'Previous feature');
        prevButton.style.display = 'none';
        prevButton.addEventListener('mouseenter', () => {
            prevButton.style.backgroundColor = '#e0e0e0';
        });
        prevButton.addEventListener('mouseleave', () => {
            prevButton.style.backgroundColor = 'transparent';
        });
        popupHeader.appendChild(prevButton);

        const nextButton = document.createElement('div');
        nextButton.className = 'popup-next-button';
        nextButton.innerHTML = '>';
        nextButton.style.cursor = 'pointer';
        nextButton.style.fontSize = '20px';
        nextButton.style.color = '#666';
        nextButton.style.width = '24px';
        nextButton.style.height = '24px';
        nextButton.style.display = 'flex';
        nextButton.style.alignItems = 'center';
        nextButton.style.justifyContent = 'center';
        nextButton.style.borderRadius = '50%';
        nextButton.setAttribute('aria-label', 'Next feature');
        nextButton.style.display = 'none';
        nextButton.addEventListener('mouseenter', () => {
            nextButton.style.backgroundColor = '#e0e0e0';
        });
        nextButton.addEventListener('mouseleave', () => {
            nextButton.style.backgroundColor = 'transparent';
        });
        popupHeader.appendChild(nextButton);

        const closeButton = document.createElement('div');
        closeButton.className = 'popup-close-button';
        closeButton.innerHTML = '×';
        closeButton.setAttribute('aria-label', 'Close popup');
        closeButton.onclick = () => {
            overlayContainerElement.style.display = 'none';
            this.clearHighlight();
        };
        popupHeader.appendChild(closeButton);
        overlayContainerElement.appendChild(popupHeader);

        const popupContent = document.createElement('div');
        popupContent.className = 'popup-content';
        overlayContainerElement.appendChild(popupContent);

        this.popupOverlay = new ol.Overlay({
            element: overlayContainerElement,
            positioning: 'bottom-center',
            stopEvent: true,
            offset: [0, -10],
            autoPan: false
        });
        this.map.addOverlay(this.popupOverlay);

        this.popupElement = overlayContainerElement;
        this.popupTitle = popupTitle;
        this.popupContent = popupContent;
        this.popupInitialized = true;
        this.currentFeatureIndex = 0;
        this.clickedFeatures = [];

        let isDragging = false;
        let startCoord;

        popupHeader.addEventListener('mousedown', (e) => {
            isDragging = true;
            const pixel = [e.clientX, e.clientY];
            startCoord = this.map.getCoordinateFromPixel(pixel);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const pixel = [e.clientX, e.clientY];
            const currentCoord = this.map.getCoordinateFromPixel(pixel);
            if (!startCoord || !currentCoord) return;

            const dx = currentCoord[0] - startCoord[0];
            const dy = currentCoord[1] - startCoord[1];

            const currentPos = this.popupOverlay.getPosition();
            if (currentPos) {
                const newPos = [
                    currentPos[0] + dx,
                    currentPos[1] + dy
                ];
                this.popupOverlay.setPosition(newPos);
                startCoord = currentCoord;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            startCoord = null;
        });

        this.map.on('click', (event) => {
            overlayContainerElement.style.display = 'none';
            this.clearHighlight();
            this.clickedFeatures = [];
            this.currentFeatureIndex = 0;

            const pixel = event.pixel;
            this.map.forEachFeatureAtPixel(pixel, (feature, layer) => {
                this.clickedFeatures.push({ feature, layer });
            }, {
                hitTolerance: 5
            });

            if (this.clickedFeatures.length > 0) {
                this.showFeatureInfo(this.currentFeatureIndex);
                this.highlightFeature(this.clickedFeatures[this.currentFeatureIndex].feature);
                overlayContainerElement.style.display = 'block';
                this.popupOverlay.setPosition(event.coordinate);

                featureCounter.textContent = this.clickedFeatures.length > 1
                    ? `${this.currentFeatureIndex + 1}/${this.clickedFeatures.length} features`
                    : '';
                prevButton.style.display = this.clickedFeatures.length > 1 ? 'block' : 'none';
                nextButton.style.display = this.clickedFeatures.length > 1 ? 'block' : 'none';

                prevButton.onclick = () => {
                    this.currentFeatureIndex = (this.currentFeatureIndex - 1 + this.clickedFeatures.length) % this.clickedFeatures.length;
                    this.showFeatureInfo(this.currentFeatureIndex);
                    this.highlightFeature(this.clickedFeatures[this.currentFeatureIndex].feature);
                };

                nextButton.onclick = () => {
                    this.currentFeatureIndex = (this.currentFeatureIndex + 1) % this.clickedFeatures.length;
                    this.showFeatureInfo(this.currentFeatureIndex);
                    this.highlightFeature(this.clickedFeatures[this.currentFeatureIndex].feature);
                };
            }
        });

        this.showFeatureInfo = (index) => {
            const { feature } = this.clickedFeatures[index];
            const properties = feature.getProperties();
            const title = properties['name'] || properties['title'] || properties['NAME'] || 'Feature Information';
            this.popupTitle.textContent = title;
            this.popupContent.innerHTML = '';

            if (properties['description']) {
                const descriptionElement = document.createElement('div');
                descriptionElement.className = 'popup-description';
                const sanitizedHTML = DOMPurify ? DOMPurify.sanitize(properties['description']) : properties['description'];
                descriptionElement.innerHTML = sanitizedHTML;
                this.popupContent.appendChild(descriptionElement);
            } else {
                this.popupContent.appendChild(this.createPropertiesTable(properties));
            }

            featureCounter.textContent = this.clickedFeatures.length > 1
                ? `${this.currentFeatureIndex + 1}/${this.clickedFeatures.length} features`
                : '';
        };
    }

    createPropertiesTable(properties) {
        const table = document.createElement('table');
        table.className = 'popup-table';

        const excludedColumns = [
            'geometry', 'GlobalID', 'Shape__Are', 'Shape__Len',
            'boundedBy', 'styleUrl', 'styleHash', 'Style', 'description',
            'name'
        ];

        const keys = Object.keys(properties).filter(key =>
            !excludedColumns.includes(key) &&
            properties[key] !== undefined &&
            properties[key] !== null &&
            properties[key] !== ''
        ).sort();

        keys.forEach(key => {
            const row = document.createElement('tr');
            const keyCell = document.createElement('th');
            keyCell.className = 'popup-table-key';
            keyCell.textContent = this.formatPropertyName(key);

            const valueCell = document.createElement('td');
            valueCell.className = 'popup-table-value';

            const value = properties[key];
            if (typeof value === 'number') {
                valueCell.textContent = this.formatNumber(value);
            } else if (value instanceof Date) {
                valueCell.textContent = value.toLocaleDateString();
            } else if (typeof value === 'boolean') {
                valueCell.textContent = value ? 'Yes' : 'No';
            } else if (typeof value === 'string' && value.startsWith('http')) {
                const link = document.createElement('a');
                link.href = value;
                link.textContent = 'Link';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                valueCell.appendChild(link);
            } else {
                valueCell.textContent = value;
            }

            row.appendChild(keyCell);
            row.appendChild(valueCell);
            table.appendChild(row);
        });

        return table;
    }

    formatPropertyName(name) {
        return name
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    formatNumber(num) {
        if (Number.isInteger(num)) {
            return num.toString();
        } else {
            return num.toFixed(2);
        }
    }

    async fetchGithubContents(path) {
        const baseUrl = 'https://api.github.com/repos/liberresearch/LiberMap/contents/';
        const response = await fetch(baseUrl + path);
        if (!response.ok) {
            throw new Error('Error fetching contents');
        }
        return await response.json();
    }

    createLiberDataPanel() {
        const liberDataButton = document.createElement('div');
        liberDataButton.id = 'liber-data-button';
        liberDataButton.className = 'liber-data-button';
        liberDataButton.textContent = '本研空間資料庫 LiberData';
        liberDataButton.setAttribute('role', 'button');
        liberDataButton.setAttribute('aria-expanded', 'false');
        liberDataButton.setAttribute('tabindex', '0');

        const categoryList = document.createElement('div');
        categoryList.className = 'category-list';
        categoryList.style.display = 'block';
        categoryList.setAttribute('aria-label', 'LiberData categories');

        const categoryListHeader = document.createElement('div');
        categoryListHeader.className = 'category-list-header';
        categoryListHeader.textContent = '本研空間資料庫 LiberData';

        const downloadAllButton = document.createElement('div');
        downloadAllButton.id = 'download-all-button';
        downloadAllButton.className = 'download-all-button';
        downloadAllButton.textContent = 'Download All';
        downloadAllButton.setAttribute('role', 'button');
        downloadAllButton.setAttribute('tabindex', '0');
        downloadAllButton.onclick = () => {
            window.location.href = 'https://s3.liscon.net/liberdata/LiberData_GML.rar';
        };
        downloadAllButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                downloadAllButton.click();
            }
        });

        categoryListHeader.appendChild(downloadAllButton);
        categoryList.appendChild(categoryListHeader);

        const categories = [
            {
                name: '土地房屋 Land & Housing',
                path: 'Data_GML/土地房屋%20Land%20%26%20Housing'
            },
            {
                name: '保育 Conservation',
                path: 'Data_GML/保育%20Conservation'
            },
            {
                name: '規劃資料 (資料源自香港政府）Planning data from HK Government',
                path: 'Data_GML/規劃資料%20(資料源自香港政府）Planning%20data%20from%20HK%20Government'
            },
			{
				name: '社區資源 Community Resources',
				path: 'Data_GML/社區資源%20Community%20Resources'
			}
        ];

        categories.forEach(category => {
            const categoryItem = this.createCategoryItem(category);
            categoryList.appendChild(categoryItem);
        });

        liberDataButton.onclick = () => {
            const isExpanded = categoryList.style.display !== 'none';
            liberDataButton.setAttribute('aria-expanded', !isExpanded);
            categoryList.style.display = isExpanded ? 'none' : 'block';
        };

        liberDataButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                liberDataButton.click();
            }
        });

        document.body.appendChild(liberDataButton);
        document.body.appendChild(categoryList);
    }
	
    createCategoryItem(category) {
        const item = document.createElement('div');
        item.className = 'category-item';

        const header = document.createElement('div');
        header.className = 'category-header';
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', 'false');

        const indicator = document.createElement('span');
        indicator.className = 'category-indicator';
        indicator.textContent = '▶';
        indicator.setAttribute('aria-hidden', 'true');

        const titleText = document.createElement('span');
        titleText.textContent = category.name;

        header.appendChild(indicator);
        header.appendChild(titleText);

        const content = document.createElement('div');
        content.className = 'category-content';
        content.style.display = 'none';
        content.setAttribute('aria-label', `${category.name} content`);

        header.onclick = (e) => {
            e.stopPropagation();
            const isExpanded = content.style.display !== 'none';
            content.style.display = isExpanded ? 'none' : 'block';
            indicator.textContent = isExpanded ? '▶' : '▼';
            header.setAttribute('aria-expanded', !isExpanded);

            if (!isExpanded && content.children.length === 0) {
                this.loadFolderContents(category.path, content);
            }
        };

        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });

        item.appendChild(header);
        item.appendChild(content);
        return item;
    }

    async loadFolderContents(path, container) {
        try {
            const contents = await this.fetchGithubContents(path);
            const list = document.createElement('ul');
            list.className = 'folder-list';

            for (const item of contents) {
                const listItem = document.createElement('li');
                listItem.className = 'folder-item';


                if (item.type === 'dir') {
                    const folderHeader = document.createElement('div');
                    folderHeader.className = 'folder-header';
                    folderHeader.textContent = item.name;

                    const folderContent = document.createElement('div');
                    folderContent.className = 'folder-content';
                    folderContent.style.display = 'none';

                    const indicator = document.createElement('span');
                    indicator.className = 'folder-indicator';
                    indicator.textContent = '▶';
                    folderHeader.prepend(indicator);

                    folderHeader.onclick = (e) => {
                        e.stopPropagation();
                        const isExpanded = folderContent.style.display !== 'none';
                        folderContent.style.display = isExpanded ? 'none' : 'block';
                        indicator.textContent = isExpanded ? '▶' : '▼';

                        if (!isExpanded && folderContent.children.length === 0) {
                            this.loadFolderContents(item.path, folderContent);
                        }
                    };

                    listItem.appendChild(folderHeader);
                    listItem.appendChild(folderContent);
                } else {
                    const fileItem = this.createFileItem(item);
                    listItem.appendChild(fileItem);
                }

                list.appendChild(listItem);
            }

            container.appendChild(list);
        } catch (error) {
            console.error('Error loading folder contents:', error);
        }
    }

    createFileItem(item) {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'file-item-container';

        const itemName = document.createElement('span');
        const displayName = item.name.replace(/\.(kml|geojson|json)$/i, '');
        itemName.textContent = this.splitBilingualName(displayName);
        itemName.className = 'file-name';

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'file-buttons';

		// Information button
		const infoButton = document.createElement('div');
		infoButton.className = 'file-info-button';
		infoButton.textContent = 'i';
		infoButton.title = 'Show file information';
		infoButton.addEventListener('click', (e) => {
			e.stopPropagation();
			this.showFileInfo(item);
		});
		
		buttonContainer.appendChild(infoButton);

        const toggleButton = document.createElement('button');
        toggleButton.textContent = '+';
        toggleButton.className = 'layer-toggle-button add';
        toggleButton.onclick = (e) => {
            e.stopPropagation();
            this.toggleLayer(item.download_url, toggleButton, item.name);
        };

        const downloadButton = document.createElement('button');
        downloadButton.textContent = '↓';
        downloadButton.className = 'download-button';
        downloadButton.onclick = (e) => {
            e.stopPropagation();
            if (item.name.toLowerCase().endsWith('.kml')) {
                this.downloadKML(item.download_url, item.name);
            } else if (item.name.toLowerCase().endsWith('.geojson') || item.name.toLowerCase().endsWith('.json')) {
                this.downloadGeoJSON(item.download_url, item.name);
            }
        };

        buttonContainer.appendChild(toggleButton);
        buttonContainer.appendChild(downloadButton);
        itemContainer.appendChild(itemName);
        itemContainer.appendChild(buttonContainer);

        return itemContainer;
    }

	showFileInfo(item) {
		fetch(item.path)
			.then(response => response.text())
			.then(kmlContent => {
				const parser = new DOMParser();
				const kmlDoc = parser.parseFromString(kmlContent, 'text/xml');
				
				// Try multiple possible tags for title
				let title = item.name.replace(/\.(kml|geojson|json)$/i, '');
				
				// Try <title> first (your KML structure), then <name> as fallback
				const titleElement = kmlDoc.querySelector('title') || kmlDoc.querySelector('name');
				const descElement = kmlDoc.querySelector('description') || kmlDoc.querySelector('Description') || kmlDoc.querySelector('info');
				
				if (titleElement && titleElement.textContent) {
					title = titleElement.innerHTML || titleElement.textContent;
					// Clean up CDATA if present
					if (title.includes('<![CDATA[')) {
						title = title.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
					}
				}
				
				let descriptionContent = 'No description available';
				if (descElement) {
					descriptionContent = descElement.innerHTML || descElement.textContent || 'No description available';
					if (descriptionContent.includes('<![CDATA[')) {
						descriptionContent = descriptionContent.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
					}
				}

				this.showInfoPopup(title, descriptionContent, true, true);
			})
			.catch(error => {
				console.error('Error loading file info:', error);
				this.showInfoPopup(item.name, 'Error loading file information.', false, false);
			});
	}
	
	showInfoPopup(title, content, titleIsHTML = false, contentIsHTML = false) {
		const existingPopup = document.querySelector('.file-info-popup');
		if (existingPopup) {
			existingPopup.remove();
		}

		const popup = document.createElement('div');
		popup.className = 'file-info-popup';
		
		// Use innerHTML for the title and content to render links
		popup.innerHTML = `
			<div class="popup-header">
				<div class="popup-title">${titleIsHTML ? title : this.escapeHtml(title)}</div>
				<div class="popup-close-button">×</div>
			</div>
			<div class="popup-content">
				<div class="popup-description">${contentIsHTML ? content : this.escapeHtml(content)}</div>
			</div>
		`;

		// Add close functionality
		const closeButton = popup.querySelector('.popup-close-button');
		closeButton.addEventListener('click', () => {
			popup.remove();
		});

		document.body.appendChild(popup);
	}

	// Add HTML escaping utility method
	escapeHtml(unsafe) {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

    async toggleLayer(url, button, fileName) {
        if (this.activeLayers.has(url)) {
            const layerInfo = this.activeLayers.get(url);
            this.map.removeLayer(layerInfo.layer);
            this.activeLayers.delete(url);
            button.textContent = '+';
            button.className = 'layer-toggle-button add';
            this.updateLegend(document.querySelector('.legend-content'));
        } else {
            try {
                button.textContent = '⏳';
                button.disabled = true;

                const response = await fetch(url);
                const fileExtension = fileName.split('.').pop().toLowerCase();

                if (fileExtension === 'kml') {
                    const kmlData = await response.text();
                    const features = new ol.format.KML({
                        extractStyles: true,
                        showPointNames: false
                    }).readFeatures(kmlData, {
                        featureProjection: 'EPSG:3857'
                    });

                    const vectorSource = new ol.source.Vector({ features });
                    const vectorLayer = new ol.layer.Vector({
                        source: vectorSource,
                        style: this.createStyleFunction(),
                        zIndex: 1000 + this.activeLayers.size
                    });

                    this.map.addLayer(vectorLayer);
                    button.textContent = '-';
                    button.className = 'layer-toggle-button remove';
                    button.disabled = false;

                    this.activeLayers.set(url, { layer: vectorLayer, button: button });
                    this.updateLegend(document.querySelector('.legend-content'));
                } else if (fileExtension === 'geojson' || fileExtension === 'json') {
                    const geojsonData = await response.json();
                    const features = new ol.format.GeoJSON().readFeatures(geojsonData, {
                        featureProjection: 'EPSG:3857'
                    });

                    const vectorSource = new ol.source.Vector({ features });
                    const vectorLayer = new ol.layer.Vector({
                        source: vectorSource,
                        style: this.createStyleFunction(),
                        zIndex: 1000 + this.activeLayers.size
                    });

                    this.map.addLayer(vectorLayer);
                    button.textContent = '-';
                    button.className = 'layer-toggle-button remove';
                    button.disabled = false;

                    this.activeLayers.set(url, { layer: vectorLayer, button: button });
                    this.updateLegend(document.querySelector('.legend-content'));
                }

                this.cleanupUnusedResources();
            } catch (error) {
                console.error('Error loading layer:', error);
                button.textContent = '!';
                setTimeout(() => {
                    button.textContent = '+';
                    button.disabled = false;
                }, 2000);
            }
        }
    }

    async downloadKML(url, filename) {
        try {
            const response = await fetch(url);
            const data = await response.text();
            const blob = new Blob([data], { type: 'application/vnd.google-earth.kml+xml' });
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error('Error downloading file:', error);
        }
    }

    async downloadGeoJSON(url, filename) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error('Error downloading file:', error);
        }
    }

    createLegendPanel() {
        const legendButton = document.createElement('div');
        legendButton.id = 'legend-button';
        legendButton.className = 'legend-button';
        legendButton.setAttribute('role', 'button');
        legendButton.setAttribute('aria-label', 'Toggle map legend');
        legendButton.setAttribute('tabindex', '0');

        const legendIcon = document.createElement('img');
        legendIcon.src = 'img/legend.png';
        legendIcon.alt = '';
        legendIcon.setAttribute('role', 'presentation');
        legendButton.appendChild(legendIcon);

        const legendPanel = document.createElement('div');
        legendPanel.id = 'legend-panel';
        legendPanel.className = 'legend-panel';
        legendPanel.style.display = 'none';
        legendPanel.setAttribute('role', 'complementary');
        legendPanel.setAttribute('aria-label', 'Map legend');

        const legendHeader = document.createElement('div');
        legendHeader.className = 'legend-header';
        legendHeader.textContent = 'Legend';

        const content = document.createElement('div');
        content.className = 'legend-content';
        content.setAttribute('role', 'region');
        content.setAttribute('aria-label', 'Legend content');

        const closeButton = document.createElement('div');
        closeButton.className = 'legend-close-button';
        closeButton.innerHTML = '×';
        closeButton.setAttribute('aria-label', 'Close legend');
        closeButton.setAttribute('role', 'button');
        closeButton.setAttribute('tabindex', '0');

        legendButton.addEventListener('click', () => {
            const isVisible = legendPanel.style.display !== 'none';
            legendPanel.style.display = isVisible ? 'none' : 'block';
            legendButton.setAttribute('aria-expanded', !isVisible);
        });

        legendButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                legendButton.click();
            }
        });

        closeButton.addEventListener('click', () => {
            legendPanel.style.display = 'none';
            legendButton.setAttribute('aria-expanded', false);
        });

        closeButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeButton.click();
            }
        });

        legendPanel.appendChild(legendHeader);
        legendPanel.appendChild(closeButton);
        legendPanel.appendChild(content);

        this.updateLegend(content);

        document.body.appendChild(legendButton);
        document.body.appendChild(legendPanel);
    }

    updateLegend(content) {
        content.innerHTML = '';

        if (this.activeLayers.size === 0) {
            const noLayersMsg = document.createElement('div');
            noLayersMsg.className = 'legend-no-layers';
            noLayersMsg.textContent = 'No active layers to display';
            content.appendChild(noLayersMsg);
            return;
        }

        const layerEntries = Array.from(this.activeLayers.entries());

        layerEntries.forEach(([url, layerInfo], index) => {
            const layerItem = document.createElement('div');
            layerItem.className = 'legend-item';
            layerItem.setAttribute('draggable', 'true');
            layerItem.setAttribute('data-url', url);

            const layerHeader = document.createElement('div');
            layerHeader.className = 'legend-layer-header';

            const layerName = url.split('/').pop().replace(/\.(kml|geojson|json)$/i, '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = layerInfo.layer.getVisible();
            checkbox.id = `layer-${layerName.replace(/\s+/g, '-')}`;
            checkbox.setAttribute('aria-label', `Toggle ${layerName} layer visibility`);
            checkbox.onchange = () => {
                layerInfo.layer.setVisible(checkbox.checked);
            };

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = layerName;

            layerHeader.appendChild(checkbox);
            layerHeader.appendChild(label);
            layerItem.appendChild(layerHeader);

            const stylesContainer = document.createElement('div');
            stylesContainer.className = 'legend-styles-container';

            this.extractAndDisplayStyles(stylesContainer, layerInfo.layer);

            layerItem.appendChild(stylesContainer);
            content.appendChild(layerItem);

            layerItem.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', url);
                layerItem.classList.add('dragging');
            });

            layerItem.addEventListener('dragend', () => {
                layerItem.classList.remove('dragging');
            });

            layerItem.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            layerItem.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedUrl = e.dataTransfer.getData('text/plain');
                if (draggedUrl === url) return;

                const newLayerEntries = [];
                const draggedEntry = layerEntries.find(entry => entry[0] === draggedUrl);
                const targetIndex = layerEntries.findIndex(entry => entry[0] === url);

                layerEntries.forEach((entry, i) => {
                    if (entry[0] === draggedUrl) return;
                    if (i === targetIndex) {
                        newLayerEntries.push(draggedEntry);
                    }
                    newLayerEntries.push(entry);
                });

                if (targetIndex === layerEntries.length - 1 && draggedUrl !== url) {
                    newLayerEntries.push(draggedEntry);
                }

                this.activeLayers.clear();
                newLayerEntries.forEach(([u, info], i) => {
                    this.activeLayers.set(u, info);
                    info.layer.setZIndex(1000 + i);
                });

                this.updateLegend(content);
            });
        });
    }

    extractAndDisplayStyles(container, layer) {
        if (!layer || !layer.getSource) {
            console.warn('Invalid layer provided to extractAndDisplayStyles');
            return;
        }

        const source = layer.getSource();
        if (!source || !source.getFeatures) {
            console.warn('Invalid source in layer');
            return;
        }

        const features = source.getFeatures();

        if (!features || features.length === 0) {
            const noFeaturesMsg = document.createElement('div');
            noFeaturesMsg.className = 'legend-no-features';
            noFeaturesMsg.textContent = 'No features in this layer';
            container.appendChild(noFeaturesMsg);
            return;
        }

        const styleMap = new Map();

        features.forEach(feature => {
            if (!feature) return;

            let styleId = feature.get('styleUrl');
            if (styleId) {
                styleId = styleId.replace(/^#/, '');
            } else if (feature.getGeometry && feature.getGeometry()) {
                styleId = feature.getGeometry().getType();
            } else {
                styleId = 'unknown';
            }

            if (!styleMap.has(styleId)) {
                const featureStyleFunc = feature.getStyleFunction();
                const layerStyleFunc = layer.getStyleFunction ? layer.getStyleFunction() : null;
                const styleFunc = featureStyleFunc || layerStyleFunc;

                if (styleFunc) {
                    try {
                        const style = styleFunc(feature);
                        if (style) {
                            styleMap.set(styleId, {
                                style: style,
                                feature: feature,
                                count: 1
                            });
                        }
                    } catch (e) {
                        console.warn('Error getting style for feature:', e);
                    }
                }
            } else {
                const entry = styleMap.get(styleId);
                entry.count++;
                styleMap.set(styleId, entry);
            }
        });

        styleMap.forEach((entry, styleId) => {
            if (!entry || !entry.style) return;

            const styleItem = document.createElement('div');
            styleItem.className = 'legend-style-item';

            const swatch = document.createElement('div');
            swatch.className = 'legend-style-swatch';

            try {
                this.renderStyleSwatch(swatch, entry.style, entry.feature);
            } catch (e) {
                console.warn('Error rendering style swatch:', e);
                swatch.textContent = '?';
            }

            const styleLabel = document.createElement('div');
            styleLabel.className = 'legend-style-label';
            styleLabel.textContent = `${styleId} (${entry.count} features)`;

            styleItem.appendChild(swatch);
            styleItem.appendChild(styleLabel);
            container.appendChild(styleItem);
        });
    }

    renderStyleSwatch(container, style, feature) {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d');

        const styles = Array.isArray(style) ? style : [style];
        const geomType = feature.getGeometry().getType();

        styles.forEach(s => {
            if (!s) return;

            if (geomType === 'Point' || geomType === 'MultiPoint') {
                const image = s.getImage();
                if (image) {
                    if (image instanceof ol.style.Circle) {
                        ctx.beginPath();
                        ctx.arc(12, 12, image.getRadius(), 0, 2 * Math.PI);
                        const fill = image.getFill();
                        if (fill) {
                            ctx.fillStyle = fill.getColor() || 'rgba(51, 153, 204, 0.7)';
                            ctx.fill();
                        }
                        const stroke = image.getStroke();
                        if (stroke) {
                            ctx.strokeStyle = stroke.getColor() || '#3399CC';
                            ctx.lineWidth = stroke.getWidth() || 1;
                            ctx.stroke();
                        }
                    } else if (image instanceof ol.style.Icon) {
                        ctx.beginPath();
                        ctx.rect(4, 4, 16, 16);
                        ctx.fillStyle = 'lightgray';
                        ctx.fill();
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
                const stroke = s.getStroke();
                if (stroke) {
                    ctx.beginPath();
                    ctx.moveTo(4, 12);
                    ctx.lineTo(20, 12);
                    ctx.strokeStyle = stroke.getColor() || '#3399CC';
                    ctx.lineWidth = stroke.getWidth() || 2;
                    ctx.stroke();
                }
            } else {
                ctx.beginPath();
                ctx.rect(4, 4, 16, 16);
                const fill = s.getFill();
                if (fill) {
                    ctx.fillStyle = fill.getColor() || 'rgba(51, 153, 204, 0.7)';
                    ctx.fill();
                }
                const stroke = s.getStroke();
                if (stroke) {
                    ctx.strokeStyle = stroke.getColor() || '#3399CC';
                    ctx.lineWidth = stroke.getWidth() || 1;
                    ctx.stroke();
                }
            }
        });

        container.appendChild(canvas);
    }

    getLegendGraphicUrl(wmsUrl) {
        const url = new URL(wmsUrl);
        url.searchParams.set('SERVICE', 'WMS');
        url.searchParams.set('VERSION', '1.3.0');
        url.searchParams.set('REQUEST', 'GetLegendGraphic');
        url.searchParams.set('FORMAT', 'image/png');
        url.searchParams.set('LAYER', url.searchParams.get('LAYERS'));
        url.searchParams.set('STYLE', url.searchParams.get('STYLES') || '');
        return url.toString();
    }

    createVectorLegend(container, layer) {
        const styleFunction = layer.getStyle();
        const canvas = document.createElement('canvas');
        canvas.width = 20;
        canvas.height = 20;
        const ctx = canvas.getContext('2d');

        let style;
        if (typeof styleFunction === 'function') {
            const features = layer.getSource().getFeatures();
            if (features.length > 0) {
                style = styleFunction(features[0]);
            }
        } else {
            style = styleFunction;
        }

        if (style) {
            const fill = style.getFill();
            const stroke = style.getStroke();

            ctx.beginPath();
            ctx.rect(2, 2, 16, 16);

            if (fill) {
                ctx.fillStyle = fill.getColor() || 'rgba(255, 255, 255, 0.4)';
                ctx.fill();
            }

            if (stroke) {
                ctx.strokeStyle = stroke.getColor() || '#3399CC';
                ctx.lineWidth = stroke.getWidth() || 1.25;
                ctx.stroke();
            }
        }

        container.appendChild(canvas);
    }

    createButton(id, src, alt, onClick) {
        const button = document.createElement('button');
        button.id = id;
        button.className = 'map-control-button';
        button.setAttribute('aria-label', alt);

        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.setAttribute('role', 'presentation');

        button.appendChild(img);
        button.onclick = onClick;

        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        });

        return button;
    }
}

function createDownloadAllButton() {
}

class UIManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.createButtons();
    }

    createButtons() {
        const buttons = [
            {
                id: 'mylocation-button',
                src: './img/myLocation.png',
                alt: 'My Location',
                onClick: () => this.mapManager.useMyLocation()
            },
            {
                id: 'home-button',
                src: './img/home.png',
                alt: 'Home',
                onClick: () => this.mapManager.goToHome()
            },
            {
                id: 'addLayer-button',
                src: './img/addLayer.png',
                alt: 'Add Layer',
                onClick: () => this.mapManager.addLayerToMap()
            },
            {
                id: 'print-button',
                src: './img/print.png',
                alt: 'Print Map',
                onClick: () => this.mapManager.printMap()
            }
        ];

        buttons.forEach(buttonConfig => {
            const button = this.mapManager.createButton(
                buttonConfig.id,
                buttonConfig.src,
                buttonConfig.alt,
                buttonConfig.onClick
            );
            document.body.appendChild(button);
        });
    }

    adjustButtonPositions() {
        const checkControls = () => {
            const zoomInButton = document.querySelector('.ol-zoom-in');
            const zoomOutButton = document.querySelector('.ol-zoom-out');

            if (!zoomInButton || !zoomOutButton) {
                setTimeout(checkControls, 100);
                return;
            }

            const buttons = [
                document.getElementById('mylocation-button'),
                document.getElementById('home-button'),
                document.getElementById('addLayer-button'),
                document.getElementById('print-button'),
                document.getElementById('basemap-button')
            ];

            const buttonWidth = zoomOutButton.getBoundingClientRect().width + 'px';
            const buttonHeight = zoomOutButton.getBoundingClientRect().height + 'px';
            let previousBottom = zoomOutButton.getBoundingClientRect().bottom;

            buttons.forEach(button => {
                if (button) {
                    button.style.width = buttonWidth;
                    button.style.height = buttonHeight;
                    button.style.top = (previousBottom + 2) + 'px';
                    previousBottom = button.getBoundingClientRect().bottom;
                }
            });
        };

        checkControls();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mapManager = new MapManager();
    const uiManager = new UIManager(mapManager);
    if (!mapManager.isMobile) {
        uiManager.adjustButtonPositions();
    }
    mapManager.createPopupInfo();
});

