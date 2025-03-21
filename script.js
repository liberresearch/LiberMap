// Constants and Configurations
const CONFIG = {
    HONG_KONG_CENTER: [114.1095, 22.3964],
    HK80_PROJECTION: 'EPSG:2326',
    WGS84_PROJECTION: 'EPSG:4326',
    DEFAULT_ZOOM: 10.3,
    GITHUB_API_URL: 'https://api.github.com/repos/liberresearch/LiberMap/contents/Data_GML'
};

// Register HK80 projection
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
        this.currentBasemapId = 'greyscale';
        this.initializeBasemapSwitcher();
    }

	setupOptimizedEventHandlers() {
		// Use a debounce function for handlers that might fire frequently
		const debounce = (func, delay) => {
			let timeout;
			return function() {
				const context = this;
				const args = arguments;
				clearTimeout(timeout);
				timeout = setTimeout(() => func.apply(context, args), delay);
			};
		};
		
		// Apply debounced handlers to map events
		this.map.on('pointermove', debounce((event) => {
			// Your existing pointermove logic
		}, 100));
		
		// Similar approach for other handlers
	}

	cleanupUnusedResources() {
		// Remove unused layers
		if (this.activeLayers.size > 5) {
			// Keep only the 5 most recently used layers
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
			
			// Update legend
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
		// Create initial basemap layer
		this.basemap = new ol.layer.Group({
			layers: [
				new ol.layer.Tile({
					source: new ol.source.XYZ({
						url: 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
						attribution: '© OpenStreetMap contributors, © CARTO'
					})
				})
			]
		});

		// Create map with default controls
		const map = new ol.Map({
			target: 'map',
			layers: [this.basemap],
			view: new ol.View({
				center: ol.proj.fromLonLat(CONFIG.HONG_KONG_CENTER),
				zoom: CONFIG.DEFAULT_ZOOM
			})
		});

		// For mobile optimization, we can selectively remove some controls
		if (this.isMobile) {
			// Get all controls
			const controls = map.getControls().getArray();
			
			// Keep only essential controls (like zoom)
			const controlsToKeep = controls.filter(control => 
				control instanceof ol.control.Zoom
			);
			
			// Remove all controls
			map.getControls().clear();
			
			// Add back only the ones we want to keep
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
        // Create a new map instance for printing
        const printContainer = document.createElement('div');
        printContainer.style.width = '800px';
        printContainer.style.height = '600px';
        document.body.appendChild(printContainer);
        
        // Get current basemap layers
        const basemapLayers = this.basemap.getLayers().getArray();
        
        // Create a new map with crossOrigin enabled
        const printMap = new ol.Map({
            target: printContainer,
            layers: [
                ...basemapLayers.map(layer => {
                    // Clone the layer with crossOrigin set to anonymous
                    const source = layer.getSource();
                    const newSource = new ol.source.XYZ({
                        url: source.getUrls() ? source.getUrls()[0] : '',
                        crossOrigin: 'anonymous',
                        attributions: source.getAttributions()
                    });
                    
                    return new ol.layer.Tile({
                        source: newSource,
                        zIndex: layer.getZIndex()
                    });
                }),
                ...Array.from(this.activeLayers.values()).map(info => info.layer)
            ],
            view: new ol.View({
                center: this.map.getView().getCenter(),
                zoom: this.map.getView().getZoom(),
                rotation: this.map.getView().getRotation()
            })
        });
		
		// Wait for the map to render
        setTimeout(() => {
            const canvas = printContainer.querySelector('canvas');
            const link = document.createElement('a');
            link.download = `map-export-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            // Cleanup
            document.body.removeChild(printContainer);
        }, 500);
    }
	
	initializeBasemapSwitcher() {
        // Define basemap configurations
        this.basemapConfigs = {
            topographic: {
                name: 'Topographic',
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
            imagery: {
                name: 'Imagery',
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
            greyscale: {
                name: 'Carto Light (Grayscale)',
                thumbnail: 'img/carto-light.png',
                layers: [
                    {
                        url: 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
						attribution: '© OpenStreetMap contributors, © CARTO'
                    }
                ]
            }
        };
        
        // Initialize with the default basemap
		this.applyBasemap(this.currentBasemapId);
		
		// Create basemap switcher button using the same pattern as other buttons
		const basemapButton = this.createButton(
			'basemap-button',
			'img/basemap.png',
			'Change Basemap',
			() => {
				// Toggle dropdown visibility
				const dropdown = document.getElementById('basemap-dropdown');
				if (dropdown) {
					const isVisible = dropdown.style.display !== 'none';
					dropdown.style.display = isVisible ? 'none' : 'block';
					
					// Position dropdown relative to button
					if (!isVisible) {
						const buttonRect = basemapButton.getBoundingClientRect();
						dropdown.style.position = 'absolute';
						dropdown.style.left = `${buttonRect.right + 10}px`;
						dropdown.style.top = `${buttonRect.top}px`;
					}
				}
			}
		);
		
		// Position the button after the other control buttons
		// This will be properly positioned by the UIManager.adjustButtonPositions method
		document.body.appendChild(basemapButton);
		
		// Create dropdown menu
		const dropdown = document.createElement('div');
		dropdown.id = 'basemap-dropdown';
		dropdown.className = 'basemap-dropdown';
		dropdown.style.display = 'none';
		
		// Add basemap options to dropdown
		Object.keys(this.basemapConfigs).forEach(id => {
			const option = this.basemapConfigs[id];
			const optionElement = document.createElement('div');
			optionElement.className = 'basemap-option';
			
			// Add thumbnail preview
			const thumbnail = document.createElement('div');
			thumbnail.className = 'basemap-thumbnail';
			thumbnail.style.backgroundImage = `url(${option.thumbnail})`;
			optionElement.appendChild(thumbnail);
			
			// Add name
			const name = document.createElement('span');
			name.textContent = option.name;
			optionElement.appendChild(name);
			
			// Set active class for current basemap
			if (id === this.currentBasemapId) {
				optionElement.classList.add('active');
			}
			
			// Add click handler
			optionElement.addEventListener('click', () => {
				this.switchBasemap(id);
				dropdown.style.display = 'none';
				
				// Update active class
				document.querySelectorAll('.basemap-option').forEach(opt => {
					opt.classList.remove('active');
				});
				optionElement.classList.add('active');
			});
			
			dropdown.appendChild(optionElement);
		});
		
		// Close dropdown when clicking outside
		document.addEventListener('click', (e) => {
			if (!basemapButton.contains(e.target) && !dropdown.contains(e.target)) {
				dropdown.style.display = 'none';
			}
		});
		
		document.body.appendChild(dropdown);
	}

    // Method to apply a basemap
    applyBasemap(basemapId) {
        const config = this.basemapConfigs[basemapId];
        if (!config) return;
        
        // Remove existing basemap layers
        if (this.basemap) {
            this.map.removeLayer(this.basemap);
        }
        
        // Create new basemap layers
        const newBasemapLayers = [];
        
        config.layers.forEach((layerConfig, index) => {
            let layer;
            
            if (layerConfig.type === 'osm') {
                // Create OSM layer
                layer = new ol.layer.Tile({
                    source: new ol.source.OSM(),
                    className: layerConfig.className || '',
                    zIndex: -100 + index // Ensure basemap layers are at the bottom
                });
            } else {
                // Create XYZ layer
                layer = new ol.layer.Tile({
                    source: new ol.source.XYZ({
                        url: layerConfig.url,
                        attributions: layerConfig.attribution || ''
                    }),
                    zIndex: -100 + index // Ensure basemap layers are at the bottom
                });
            }
            
            newBasemapLayers.push(layer);
        });
        
        // Create a new layer group for the basemap
        this.basemap = new ol.layer.Group({
            layers: newBasemapLayers
        });
        
        // Add the new basemap to the map
        this.map.addLayer(this.basemap);
        
        // Update the global basemap layers array for reference
        this.basemapLayers = newBasemapLayers;
    }

    // Method to switch basemap
    switchBasemap(basemapId) {
        if (!this.basemapConfigs[basemapId] || basemapId === this.currentBasemapId) return;
        
        // Apply the new basemap
        this.applyBasemap(basemapId);
        
        // Update current basemap ID
        this.currentBasemapId = basemapId;
        
        console.log(`Switched basemap to: ${basemapId}`);
        
        // Dispatch a custom event that other tools can listen for
        const event = new CustomEvent('basemapChanged', { 
            detail: { 
                basemapId: basemapId,
                basemapLayers: this.basemapLayers 
            } 
        });
        document.dispatchEvent(event);
    }

    // Method to get current basemap layers (for other tools to use)
    getCurrentBasemapLayers() {
        return this.basemapLayers;
    }

    // Method to get current basemap ID (for other tools to use)
    getCurrentBasemapId() {
        return this.currentBasemapId;
    }
		
	
	initializeSearchTool() {
	  // Create main container with dropdown
	  const searchContainer = document.createElement('div');
	  searchContainer.id = 'search-container';
	  searchContainer.className = 'search-container';

	  // Create dropdown toggle button
	  const dropdownToggle = document.createElement('div');
	  dropdownToggle.className = 'search-dropdown-toggle';
	  dropdownToggle.innerHTML = '▼';
	  dropdownToggle.setAttribute('role', 'button');
	  dropdownToggle.setAttribute('aria-label', 'Toggle search engines');
	  dropdownToggle.setAttribute('tabindex', '0');

	  // Create dropdown menu (initially hidden)
	  const dropdownMenu = document.createElement('div');
	  dropdownMenu.className = 'search-dropdown-menu';
	  dropdownMenu.style.display = 'none';

	  // Create search engines options
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

	  // Create input container
	  const inputContainer = document.createElement('div');
	  inputContainer.className = 'search-input-container';

	  // Create search inputs for each engine
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

	  // Add elements to containers
	  inputContainer.appendChild(googleSearchInput);
	  inputContainer.appendChild(locationSearchInput);
	  searchContainer.appendChild(dropdownToggle);
	  searchContainer.appendChild(inputContainer);
	  document.body.appendChild(searchContainer);
	  document.body.appendChild(dropdownMenu);

	  // Create results container (initially empty)
	  const resultContainer = document.createElement('div');
	  resultContainer.className = 'search-results-container';
	  resultContainer.style.display = 'none';
	  document.body.appendChild(resultContainer);

	  // Create a pin marker layer for search results
	  const pinMarkerSource = new ol.source.Vector();
	  const pinMarkerLayer = new ol.layer.Vector({
		source: pinMarkerSource,
		zIndex: 1000 // Ensure it's on top of other layers
	  });
	  this.map.addLayer(pinMarkerLayer);

	  // Variable to store the current pin timer
	  let pinTimer = null;

	  // Function to add pin marker at a location
	  const addPinMarker = (coordinates) => {
		// Clear previous markers and any existing timer
		pinMarkerSource.clear();
		if (pinTimer) {
		  clearTimeout(pinTimer);
		}
		
		// Create marker feature
		const marker = new ol.Feature({
		  geometry: new ol.geom.Point(coordinates)
		});
		
		// Create marker style with pin image
		const markerStyle = new ol.style.Style({
		  image: new ol.style.Icon({
			src: 'img/pin.png',
			anchor: [0.5, 1], // Center bottom of the image
			scale: 0.05 // Adjust scale as needed
		  })
		});
		
		marker.setStyle(markerStyle);
		pinMarkerSource.addFeature(marker);
		
		// Set timer to remove the pin after 5 seconds
		pinTimer = setTimeout(() => {
		  pinMarkerSource.clear();
		  pinTimer = null;
		}, 5000);
	  };

	  // Toggle dropdown when clicking the toggle button
	  dropdownToggle.onclick = () => {
		const isVisible = dropdownMenu.style.display !== 'none';
		dropdownMenu.style.display = isVisible ? 'none' : 'block';
		// Position the dropdown menu below the toggle button
		if (!isVisible) {
		  const rect = dropdownToggle.getBoundingClientRect();
		  dropdownMenu.style.left = `${rect.left}px`;
		  dropdownMenu.style.top = `${rect.bottom + window.scrollY}px`;
		}
	  };

	  // Keyboard accessibility
	  dropdownToggle.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
		  e.preventDefault();
		  dropdownToggle.click();
		}
	  });

	  // Function to set active search engine
	  const setActiveEngine = (engineId) => {
		// Hide all inputs
		googleSearchInput.style.display = 'none';
		locationSearchInput.style.display = 'none';
		
		// Show selected input
		if (engineId === 'google') {
		  googleSearchInput.style.display = 'block';
		  dropdownToggle.setAttribute('aria-label', 'Google Places (click to change)');
		} else if (engineId === 'locationSearch') {
		  locationSearchInput.style.display = 'block';
		  dropdownToggle.setAttribute('aria-label', 'Location Search API (click to change)');
		}
		
		// Clear any existing results
		resultContainer.style.display = 'none';
		resultContainer.innerHTML = '';
		
		// Clear any existing pin markers and timer
		pinMarkerSource.clear();
		if (pinTimer) {
		  clearTimeout(pinTimer);
		  pinTimer = null;
		}
	  };

	  // Initialize Google Places search
	  let searchBox;
	  const initGoogleSearch = () => {
		searchBox = new google.maps.places.SearchBox(googleSearchInput);
		searchBox.addListener('places_changed', () => {
		  const places = searchBox.getPlaces();
		  if (places.length === 0) return;
		  
		  const place = places[0];
		  const coordinates = [place.geometry.location.lng(), place.geometry.location.lat()];
		  const transformedCoords = ol.proj.fromLonLat(coordinates);
		  
		  // Add pin marker at the location
		  addPinMarker(transformedCoords);
		  
		  // Animate to the location
		  this.map.getView().animate({
			center: transformedCoords,
			zoom: 15,
			duration: 1000
		  });
		});
	  };

	  // Initialize Location Search API
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
				
				// Transform directly from HK1980 to the map's projection
				const transformedCoords = ol.proj.transform([x, y], hk1980Projection, mapProjection);
				
				// Add pin marker at the location
				addPinMarker(transformedCoords);
				
				// Animate to the location
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
			
			// Position and show results
			const rect = locationSearchInput.getBoundingClientRect();
			resultContainer.style.left = `${rect.left}px`;
			resultContainer.style.top = `${rect.bottom + window.scrollY}px`;
			resultContainer.style.width = `${rect.width}px`;
			resultContainer.style.display = 'block';
		  })
		  .catch(error => console.error('Error fetching location search results:', error));
	  };

	  // Initialize Google search by default
	  initGoogleSearch();
	  setActiveEngine('google');

	  // Close dropdown and results when clicking elsewhere
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
		inputElement.accept = '.kml'; // Changed from .geojson,.json
		inputElement.onchange = this.handleFileUpload.bind(this);
		inputElement.click();
	}



	processKML(content) {
		try {
			const features = new ol.format.KML().readFeatures(content, {
				featureProjection: 'EPSG:3857'
			});
	
			const vectorSource = new ol.source.Vector({ features });
			const vectorLayer = new ol.layer.Vector({
				source: vectorSource,
				style: this.createStyleFunction()
			});
	
			const fileName = this.currentFileName || 'uploaded-layer.kml';
			
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
		}
	}
	

	handleFileUpload(event) {
		const file = event.target.files[0];
		if (!file) return;
		
		this.currentFileName = file.name;
		
		const reader = new FileReader();
		reader.onload = (e) => this.processKML(e.target.result);
		reader.onerror = (error) => {
			console.error('File reading error: ', error);
			alert('Error reading file.');
		};
		reader.readAsText(file);
	}


	createStyleFunction() {
		return (feature) => {
			const properties = feature.getProperties();
			
			// For point features - using OpenLayers default circle style
			if (feature.getGeometry().getType() === 'Point') {
				return new ol.style.Style({
					image: new ol.style.Circle({
						radius: 7,
						fill: new ol.style.Fill({
							color: '#3399CC'
						}),
						stroke: new ol.style.Stroke({
							color: '#fff',
							width: 2
						})
					})
				});
			}
	
			// For lines and polygons - using OpenLayers default styles
			return new ol.style.Style({
				fill: new ol.style.Fill({
					color: 'rgba(51, 153, 204, 0.7)'
				}),
				stroke: new ol.style.Stroke({
					color: '#3399CC',
					width: 2
				})
			});
		};
	}

	// Helper method to convert hex/rgb to rgba
	convertToRGBA(color, opacity) {
		// If already rgba, return as is
		if (color.startsWith('rgba')) return color;
		
		// If rgb, convert to rgba
		if (color.startsWith('rgb')) {
			return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
		}
		
		// Convert hex to rgba
		const hex = color.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		
		return `rgba(${r}, ${g}, ${b}, ${opacity})`;
	}


	
	createPopupInfo() {
		const overlayContainerElement = document.createElement('div');
		overlayContainerElement.className = 'popup-container';
		document.body.appendChild(overlayContainerElement);

		const closeButton = document.createElement('div');
		closeButton.className = 'popup-close-button';
		closeButton.innerHTML = '&times;';
		closeButton.onclick = () => {
			overlayContainerElement.style.display = 'none';
		};
		overlayContainerElement.appendChild(closeButton);

		const overlayLayer = new ol.Overlay({
			element: overlayContainerElement,
			positioning: 'bottom-center',
			stopEvent: true, // Ensure the pop-up can handle its own events
			offset: [0, -10]
		});
		this.map.addOverlay(overlayLayer);

		this.map.on('click', (event) => {
			const feature = this.map.forEachFeatureAtPixel(event.pixel, (feature) => feature);
			if (feature) {
				const properties = feature.getProperties();
				const description = properties['description']; // Extract the 'description' column

				overlayContainerElement.innerHTML = '';
				overlayContainerElement.appendChild(closeButton);

				if (description) {
					const descriptionElement = document.createElement('div');
					descriptionElement.className = 'popup-description';
					descriptionElement.innerHTML = description; // Render HTML content
					overlayContainerElement.appendChild(descriptionElement);
				}

				overlayLayer.setPosition(event.coordinate);
				overlayContainerElement.style.display = 'block';
			} else {
				overlayContainerElement.style.display = 'none';
			}
		});

		// Prevent map movement when interacting with the pop-up
		overlayContainerElement.addEventListener('mousedown', (event) => {
			event.stopPropagation();
		});
		overlayContainerElement.addEventListener('mousemove', (event) => {
			event.stopPropagation();
		});
		overlayContainerElement.addEventListener('mouseup', (event) => {
			event.stopPropagation();
		});
	}

	createPropertiesTable(properties) {
		const table = document.createElement('table');
		table.className = 'popup-table';
		
		// Define columns to exclude
		const excludedColumns = ['geometry', 'GlobalID','Shape__Are','Shape__Len'];
		
		Object.keys(properties).forEach((key) => {
			// Only create row if key is not in excluded columns
			if (!excludedColumns.includes(key)) {
				const row = document.createElement('tr');
				
				const keyCell = document.createElement('td');
				keyCell.className = 'popup-table-key';
				keyCell.textContent = key;
				
				const valueCell = document.createElement('td');
				valueCell.className = 'popup-table-value';
				valueCell.textContent = properties[key];
				
				row.appendChild(keyCell);
				row.appendChild(valueCell);
				table.appendChild(row);
			}
		});
		
		return table;
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
		liberDataButton.textContent = 'LiberData';
		
		// Add accessibility attributes
		liberDataButton.setAttribute('role', 'button');
		liberDataButton.setAttribute('aria-expanded', 'false');
		liberDataButton.setAttribute('tabindex', '0');  // Make it focusable with tab
		
		const categoryList = document.createElement('div');
		categoryList.className = 'category-list';
		categoryList.style.display = 'none';
		categoryList.setAttribute('aria-label', 'LiberData categories');
		
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
			}
		];
		
		categories.forEach(category => {
			const categoryItem = this.createCategoryItem(category);
			categoryList.appendChild(categoryItem);
		});
		
		// Add click handler
		liberDataButton.onclick = () => {
			const isExpanded = categoryList.style.display !== 'none';
			liberDataButton.setAttribute('aria-expanded', !isExpanded);
			categoryList.style.display = isExpanded ? 'none' : 'block';
		};
		
		// Add keyboard handler for accessibility
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
		
		// Add indicator for better UX
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
		
		// Add click handler
		header.onclick = (e) => {
			e.stopPropagation();
			const isExpanded = content.style.display !== 'none';
			content.style.display = isExpanded ? 'none' : 'block';
			indicator.textContent = isExpanded ? '▶' : '▼';
			header.setAttribute('aria-expanded', !isExpanded);
			
			// Load content if it's empty and being expanded
			if (!isExpanded && content.children.length === 0) {
				this.loadFolderContents(category.path, content);
			}
		};
		
		// Add keyboard handler
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

    async createCategorySection(name, path, container) {
        const section = document.createElement('div');
        section.className = 'category-section';

        const header = document.createElement('div');
        header.className = 'category-header';
        header.textContent = name;

        const content = document.createElement('div');
        content.className = 'category-content';
        content.style.display = 'none';

        header.onclick = () => {
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
            if (content.children.length === 0) {
                this.loadFolderContents(path, content);
            }
        };

        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);
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
					// Create expandable folder
					const folderHeader = document.createElement('div');
					folderHeader.className = 'folder-header';
					folderHeader.textContent = item.name;
					
					const folderContent = document.createElement('div');
					folderContent.className = 'folder-content';
					folderContent.style.display = 'none';
	
					// Add expand/collapse indicator
					const indicator = document.createElement('span');
					indicator.className = 'folder-indicator';
					indicator.textContent = '▶';
					folderHeader.insertBefore(indicator, folderHeader.firstChild);
	
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
					// Create file item
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
		itemName.textContent = item.name;
		itemName.className = 'file-name';
	
		const buttonContainer = document.createElement('div');
		buttonContainer.className = 'file-buttons';
	
		const toggleButton = document.createElement('button');
		toggleButton.textContent = '+';
		toggleButton.className = 'layer-toggle-button add';
		toggleButton.onclick = (e) => {
			e.stopPropagation();
			this.toggleLayer(item.download_url, toggleButton);
		};
	
		const downloadButton = document.createElement('button');
		downloadButton.textContent = '↓';
		downloadButton.className = 'download-button';
		downloadButton.onclick = (e) => {
			e.stopPropagation();
			this.downloadKML(item.download_url, item.name);
		};
	
		buttonContainer.appendChild(toggleButton);
		buttonContainer.appendChild(downloadButton);
		
		itemContainer.appendChild(itemName);
		itemContainer.appendChild(buttonContainer);
		
		return itemContainer;
	}
	
	async toggleLayer(url, button) {
		if (this.activeLayers.has(url)) {
			const layerInfo = this.activeLayers.get(url);
			this.map.removeLayer(layerInfo.layer);
			this.activeLayers.delete(url);
			button.textContent = '+';
			button.className = 'layer-toggle-button add';
			this.updateLegend(document.querySelector('.legend-content'));
		} else {
			try {
				const response = await fetch(url);
				const kmlData = await response.text();
				const features = new ol.format.KML().readFeatures(kmlData, {
					featureProjection: 'EPSG:3857'
				});
				
				const vectorSource = new ol.source.Vector({ features });
				const vectorLayer = new ol.layer.Vector({
					source: vectorSource,
					style: this.createStyleFunction()
				});
				
				this.map.addLayer(vectorLayer);
				this.map.getView().fit(vectorSource.getExtent(), { duration: 1500 });
				button.textContent = '-';
				button.className = 'layer-toggle-button remove';
				this.activeLayers.set(url, { layer: vectorLayer, button: button });
			} catch (error) {
				console.error('Error loading KML:', error);
			}
			this.updateLegend(document.querySelector('.legend-content'));
		}
	}


    async loadKMLFile(url) {
		try {
			const response = await fetch(url);
			const kmlData = await response.text();
			const features = new ol.format.KML().readFeatures(kmlData, {
				featureProjection: 'EPSG:3857'
			});
	
			const vectorSource = new ol.source.Vector({ features });
			const vectorLayer = new ol.layer.Vector({
				source: vectorSource,
				style: this.createStyleFunction()
			});
	
			this.map.addLayer(vectorLayer);
			this.map.getView().fit(vectorSource.getExtent(), { duration: 1000 });
		} catch (error) {
			console.error('Error loading KML:', error);
		}
	}
	
	// downloadKML
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
		// Create the legend button with circular background
		const legendButton = document.createElement('div');
		legendButton.id = 'legend-button';
		legendButton.className = 'legend-button';
		legendButton.setAttribute('role', 'button');
		legendButton.setAttribute('aria-label', 'Toggle map legend');
		legendButton.setAttribute('tabindex', '0');
		
		// Add the icon
		const legendIcon = document.createElement('img');
		legendIcon.src = 'img/legend.png';
		legendIcon.alt = '';
		legendIcon.setAttribute('role', 'presentation');
		legendButton.appendChild(legendIcon);
		
		// Create the legend panel
		const legendPanel = document.createElement('div');
		legendPanel.id = 'legend-panel';
		legendPanel.className = 'legend-panel';
		legendPanel.style.display = 'none';
		legendPanel.setAttribute('role', 'complementary');
		legendPanel.setAttribute('aria-label', 'Map legend');
		
		// Create legend content
		const content = document.createElement('div');
		content.className = 'legend-content';
		content.setAttribute('role', 'region');
		content.setAttribute('aria-label', 'Legend content');
		
		// Add close button to the legend panel
		const closeButton = document.createElement('div');
		closeButton.className = 'legend-close-button';
		closeButton.innerHTML = '&times;';
		closeButton.setAttribute('aria-label', 'Close legend');
		closeButton.setAttribute('role', 'button');
		closeButton.setAttribute('tabindex', '0');
		
		// Add event listeners
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
		
		// Assemble the legend panel
		legendPanel.appendChild(closeButton);
		legendPanel.appendChild(content);
		
		// Update the legend content
		this.updateLegend(content);
		
		// Add to the document
		document.body.appendChild(legendButton);
		document.body.appendChild(legendPanel);
	}

	updateLegend(content) {
		content.innerHTML = '';
		this.activeLayers.forEach((layerInfo, url) => {
			const layerItem = document.createElement('div');
			layerItem.className = 'legend-item';

			// Create container for legend graphics and controls
			const legendContainer = document.createElement('div');
			legendContainer.className = 'legend-container';

			// Add checkbox for layer visibility
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = layerInfo.layer.getVisible();
			checkbox.id = `layer-${url.split('/').pop()}`;
			checkbox.setAttribute('aria-label', `Toggle ${url.split('/').pop()} layer visibility`);

			// Add label with layer name
			const label = document.createElement('label');
			label.htmlFor = checkbox.id;
			label.textContent = url.split('/').pop().replace('.geojson', '');

			// Create legend graphic container
			const legendGraphic = document.createElement('div');
			legendGraphic.className = 'legend-graphic';

			// Get legend graphic from WMS if available
			if (url.includes('wms')) {
				const legendUrl = this.getLegendGraphicUrl(url);
				const img = document.createElement('img');
				img.src = legendUrl;
				img.alt = `Legend for ${label.textContent}`;
				legendGraphic.appendChild(img);
			} else {
				// Create custom legend for vector layers
				this.createVectorLegend(legendGraphic, layerInfo.layer);
			}

			checkbox.onchange = () => {
				layerInfo.layer.setVisible(checkbox.checked);
			};

			legendContainer.appendChild(checkbox);
			legendContainer.appendChild(label);
			legendContainer.appendChild(legendGraphic);
			layerItem.appendChild(legendContainer);
			content.appendChild(layerItem);
		});
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

		// Get the actual style from the style function
		let style;
		if (typeof styleFunction === 'function') {
			const features = layer.getSource().getFeatures();
			if (features.length > 0) {
				style = styleFunction(features[0]);
			}
		} else {
			style = styleFunction;
		}

		// Draw vector style representation
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







// UI Manager
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
            
            const buttonWidth = (zoomOutButton.getBoundingClientRect().width) + 'px';
            const buttonHeight = (zoomOutButton.getBoundingClientRect().height) + 'px';
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

// Update initialization
document.addEventListener('DOMContentLoaded', () => {
    const mapManager = new MapManager();
    const uiManager = new UIManager(mapManager);
    uiManager.adjustButtonPositions();
    mapManager.createPopupInfo();

});
