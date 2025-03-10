// Constants and Configurations
const CONFIG = {
    HONG_KONG_CENTER: [114.1095, 22.3964],
    HK80_PROJECTION: 'EPSG:2326',
    WGS84_PROJECTION: 'EPSG:4326',
    DEFAULT_ZOOM: 10.3,
    GITHUB_API_URL: 'https://api.github.com/repos/cysyiu/LiberMap/contents/Data_GML'
};

// Register HK80 projection
proj4.defs(CONFIG.HK80_PROJECTION, "+proj=tmerc +lat_0=22.31213333333333 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +datum=HK80 +units=m +no_defs");
ol.proj.proj4.register(proj4);

class MapManager {
    constructor() {
        this.map = this.initializeMap();
        this.setupMapAccessibility();
        this.initializeComponents();
    }

    setupMapAccessibility() {
        this.map.getTargetElement().setAttribute('role', 'application');
        this.map.getTargetElement().setAttribute('aria-label', 'Interactive map of Hong Kong');
        this.activeLayers = new Map();
        this.locationMarker = null;
        this.vectorSource = null;
    }
	
	initializeComponents() {
        this.categories = {
            'Land & Housing': 'Data_JSON/Land%20%26%20Housing',
            'Conservation': 'Data_JSON/Conservation',
            'Planning Data from HK Government': 'Data_JSON/Planning%20data%20from%20HK%20Government'
        };
        this.initializeSearchTool();
        this.createLegendPanel();
        this.createPopupInfo();
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

	printMap() {
		// Create a new map instance for printing
		const printContainer = document.createElement('div');
		printContainer.style.width = '800px';
		printContainer.style.height = '600px';
		document.body.appendChild(printContainer);

		// Create a new map with crossOrigin enabled
		const printMap = new ol.Map({
			target: printContainer,
			layers: [
				new ol.layer.Tile({
					source: new ol.source.XYZ({
						url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/wgs84/{z}/{x}/{y}.png',
						crossOrigin: 'anonymous'
					})
				}),
				new ol.layer.Tile({
					source: new ol.source.XYZ({
						url: 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/en/wgs84/{z}/{x}/{y}.png',
						crossOrigin: 'anonymous'
					})
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
	
	initializeSearchTool() {
		const searchContainer = document.createElement('div');
		searchContainer.id = 'search-container';
		searchContainer.className = 'search-container';
		
		const searchInput = document.createElement('input');
		searchInput.id = 'search-input';
		searchInput.type = 'text';
		searchInput.placeholder = 'Search location...';
		
		searchContainer.appendChild(searchInput);
		document.body.appendChild(searchContainer);
		
		const searchBox = new google.maps.places.SearchBox(searchInput);
		
		searchBox.addListener('places_changed', () => {
			const places = searchBox.getPlaces();
			if (places.length === 0) return;
			
			const place = places[0];
			const coordinates = [place.geometry.location.lng(), place.geometry.location.lat()];
			const transformedCoords = ol.proj.fromLonLat(coordinates);
			
			this.map.getView().animate({
				center: transformedCoords,
				zoom: 15,
				duration: 1000
			});
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
			
			// Handle nested style object
			if (properties.style) {
				const fillColor = properties.style.fill || '#ffffff';
				// Convert hex to rgba with 0.7 opacity
				const rgbaFill = this.convertToRGBA(fillColor, 0.7);
				
				return new ol.style.Style({
					fill: new ol.style.Fill({
						color: rgbaFill
					}),
					stroke: new ol.style.Stroke({
						color: properties.style.stroke || '#319FD3',
						width: properties.style['stroke-width'] || 1
					})
				});
			}
			
			// Handle direct style properties
			const fillColor = properties.fill || '#ffffff';
			const rgbaFill = this.convertToRGBA(fillColor, 0.7);
			
			return new ol.style.Style({
				fill: new ol.style.Fill({
					color: rgbaFill
				}),
				stroke: new ol.style.Stroke({
					color: properties.stroke || '#319FD3',
					width: properties['stroke-width'] || 1
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
			stopEvent: false,
			offset: [0, -10]
		});
		this.map.addOverlay(overlayLayer);

		this.map.on('click', (event) => {
			const feature = this.map.forEachFeatureAtPixel(event.pixel, (feature) => feature);
			if (feature) {
				const properties = feature.getProperties();
				const popupTable = this.createPropertiesTable(properties);

				overlayContainerElement.innerHTML = '';
				overlayContainerElement.appendChild(closeButton);
				overlayContainerElement.appendChild(popupTable);

				overlayLayer.setPosition(event.coordinate);
				overlayContainerElement.style.display = 'block';
			} else {
				overlayContainerElement.style.display = 'none';
			}
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
        const baseUrl = 'https://api.github.com/repos/cysyiu/LiberMap/contents/';
        const response = await fetch(baseUrl + path);
        if (!response.ok) {
            throw new Error('Error fetching contents');
        }
        return await response.json();
    }

    createExpandableLists() {
        const categoryConfigs = [
            {
                id: 'land-housing',
                name: 'Land & Housing',
                path: 'Data_JSON/Land%20%26%20Housing'
            },
            {
                id: 'conservation',
                name: 'Conservation',
                path: 'Data_JSON/Conservation'
            },
            {
                id: 'planning',
                name: 'Planning Data from HK Government',
                path: 'Data_JSON/Planning%20data%20from%20HK%20Government'
            }
        ];

        categoryConfigs.forEach(config => {
            const container = document.createElement('div');
            container.className = 'category-container';
            container.id = config.id;
            container.setAttribute('role', 'region');
            container.setAttribute('aria-label', `${config.name} category`);

            const header = document.createElement('div');
            header.className = 'category-header';
            header.textContent = config.name;
            header.setAttribute('role', 'button');
            header.setAttribute('aria-expanded', 'false');
            header.setAttribute('tabindex', '0');

            const content = document.createElement('div');
            content.className = 'category-content';
            content.style.display = 'none';
            content.setAttribute('role', 'region');
            content.setAttribute('aria-label', `${config.name} content`);

            header.onclick = () => {
                const isExpanded = content.style.display !== 'none';
                header.setAttribute('aria-expanded', !isExpanded);
                content.style.display = isExpanded ? 'none' : 'block';
                if (content.children.length === 0) {
                    this.loadFolderContents(config.path, content);
                }
            };

            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    header.click();
                }
            });

            container.appendChild(header);
            container.appendChild(content);
            document.body.appendChild(container);
        });
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

			contents.forEach(item => {
				const listItem = document.createElement('li'); // Create listItem here
				listItem.className = 'folder-item';

				if (item.type === 'dir') {
					const folderHeader = document.createElement('div');
					folderHeader.className = 'folder-header';
					folderHeader.textContent = item.name;
					
					const folderContent = document.createElement('div');
					folderContent.className = 'folder-content';
					folderContent.style.display = 'none';

					folderHeader.onclick = (e) => {
						e.stopPropagation();
						folderContent.style.display = folderContent.style.display === 'none' ? 'block' : 'none';
						if (folderContent.children.length === 0) {
							this.loadFolderContents(item.path, folderContent);
						}
					};

					listItem.appendChild(folderHeader);
					listItem.appendChild(folderContent);
				} else {
					const itemContainer = document.createElement('div');
					itemContainer.className = 'file-item-container';

					const itemName = document.createElement('span');
					itemName.textContent = item.name;
					itemName.className = 'file-name';

					const toggleButton = document.createElement('button');
					toggleButton.textContent = '+';
					toggleButton.className = 'layer-toggle-button add';
					toggleButton.onclick = (e) => {
						e.stopPropagation();
						this.toggleLayer(item.download_url, toggleButton);
					};

					// Add download button
					const downloadButton = document.createElement('button');
					downloadButton.textContent = '↓';
					downloadButton.className = 'download-button';
					downloadButton.onclick = (e) => {
						e.stopPropagation();
						this.downloadGeoJSON(item.download_url, item.name);
					};

					itemContainer.appendChild(toggleButton);
					itemContainer.appendChild(itemName);
					itemContainer.appendChild(downloadButton);
					listItem.appendChild(itemContainer);
				}

				list.appendChild(listItem);
			});

			container.appendChild(list);
		} catch (error) {
			console.error('Error loading folder contents:', error);
		}
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
	
	// Update downloadGeoJSON to downloadKML
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
        const legendPanel = document.createElement('div');
        legendPanel.id = 'legend-panel';
        legendPanel.className = 'legend-panel';
        legendPanel.setAttribute('role', 'complementary');
        legendPanel.setAttribute('aria-label', 'Map legend');

        const header = document.createElement('div');
        header.className = 'legend-header';
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('tabindex', '0');

        const title = document.createElement('span');
        title.textContent = 'Legend';

        const toggleButton = document.createElement('span');
        toggleButton.className = 'legend-toggle';
        toggleButton.textContent = '▶';
        toggleButton.setAttribute('aria-hidden', 'true');

        const content = document.createElement('div');
        content.className = 'legend-content';
        content.style.display = 'none';
        content.setAttribute('role', 'region');
        content.setAttribute('aria-label', 'Legend content');

        header.onclick = () => {
            const isExpanded = content.style.display !== 'none';
            header.setAttribute('aria-expanded', !isExpanded);
            content.style.display = isExpanded ? 'none' : 'block';
            toggleButton.textContent = isExpanded ? '▶' : '▼';
        };

        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });

        header.appendChild(title);
        header.appendChild(toggleButton);
        legendPanel.appendChild(header);
        legendPanel.appendChild(content);

        this.updateLegend(content);
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
                document.getElementById('print-button')
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
    mapManager.createExpandableLists();
    mapManager.loadGoogleMyMap(); // Add this line
});
