
document.addEventListener('DOMContentLoaded', () => {
    // --- Selectores del DOM ---
    const tabs = document.querySelectorAll('.tab-button');
    const views = document.querySelectorAll('.view');
    const form = document.getElementById('deliverable-form');
    const tableBody = document.getElementById('deliverables-body');
    const searchInput = document.getElementById('search-input');
    const monthFilterSelect = document.getElementById('month-filter');
    const cancelButton = document.getElementById('cancel-button');
    const noResultsMessage = document.getElementById('no-results');
    const exportButton = document.getElementById('export-excel-btn');
    const submitButton = form.querySelector('button[type="submit"]');

    // UI para Carga y Errores
    const loaderOverlay = document.getElementById('loader-overlay');
    const loaderMessage = document.getElementById('loader-message');
    const errorToast = document.getElementById('error-toast');
    const errorMessage = document.getElementById('error-message');
    const errorCloseBtn = document.getElementById('error-close');
    const successToast = document.getElementById('success-toast');
    const successMessage = document.getElementById('success-message');
    const successCloseBtn = document.getElementById('success-close');

    // URL de la implementación de Google Apps Script
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzej1XxGOgOBatZFtYkHOM6tWYMEQlE9-MU8UGKVKGHwQfXQFECdWoud143keUCEkwN/exec'
    // --- Estado de la aplicación ---
    let deliverables = [];
    let editingDeliverableId = null;
    let searchQuery = '';
    let monthFilter = '';
    let isFormDirty = false;

    // --- Funciones de UI (Loader y Toasts) ---
    const showLoader = (message) => {
        loaderMessage.textContent = message;
        loaderOverlay.style.opacity = '1';
        loaderOverlay.style.pointerEvents = 'auto';
    };
    const hideLoader = () => {
        loaderOverlay.style.opacity = '0';
        loaderOverlay.style.pointerEvents = 'none';
    };

    let errorTimeout;
    const showError = (message) => {
        errorMessage.textContent = message;
        errorToast.style.bottom = '2rem';
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(hideError, 6000); // Ocultar después de 6 segundos
    };
    const hideError = () => {
        errorToast.style.bottom = '-100%';
    };

    let successTimeout;
    const showSuccess = (message) => {
        successMessage.textContent = message;
        successToast.style.bottom = '2rem';
        clearTimeout(successTimeout);
        successTimeout = setTimeout(hideSuccess, 4000); // Ocultar después de 4 segundos
    };
    const hideSuccess = () => {
        successToast.style.bottom = '-100%';
    };

    // --- Wrapper de Fetch para manejo centralizado ---
    const fetchWithHandling = async (url, options = {}, loadingMessage) => {
        // Solo muestra el loader si se proporciona un mensaje
        if (loadingMessage) {
            showLoader(loadingMessage);
        }
        
        const finalOptions = { ...options };
        if (finalOptions.body) {
            finalOptions.headers = {
                ...finalOptions.headers,
                'Content-Type': 'text/plain;charset=utf-8',
            };
        }

        try {
            const response = await fetch(url, finalOptions);

            if (!response.ok) {
                let errorText = `Error del servidor: ${response.status} ${response.statusText}`;
                try {
                    const errorBody = await response.text();
                    console.error("DEBUG: Texto completo del error del servidor:", errorBody); 
                    
                    if (errorBody.trim().startsWith('<!DOCTYPE html>')) {
                        errorText = 'El script de Google devolvió un error. Revisa la consola y la configuración del script.';
                    } else {
                        errorText = `Error: ${errorBody}`;
                    }
                } catch (e) { /* ignorar */ }
                throw new Error(errorText);
            }
            
            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Respuesta no válida del servidor. Asegúrate de que el script devuelva JSON.');
            }
        } catch (error) {
            showError(error.message);
            throw error;
        } finally {
            if (loadingMessage) {
                hideLoader();
            }
        }
    };

    // --- Funciones de la aplicación ---
    const setFormDirty = () => { isFormDirty = true; };
    const resetFormDirtyState = () => { isFormDirty = false; };

    const loadDeliverables = async () => {
        tableBody.innerHTML = '';
        noResultsMessage.style.display = 'none';
        
        if (SCRIPT_URL.includes('PEGA_AQUÍ')) {
            showError('Error de configuración: Por favor, actualiza la SCRIPT_URL en index.js.');
            noResultsMessage.textContent = 'La aplicación no está configurada.';
            noResultsMessage.style.display = 'block';
            return;
        }

        try {
            const data = await fetchWithHandling(SCRIPT_URL, {}, 'Cargando entregables...');
            if (data.error) throw new Error(data.error);
            
            deliverables = data;
            renderTable();
            populateMonthFilter();
        } catch (error) {
            noResultsMessage.textContent = 'No se pudieron cargar los datos. Revisa el error y vuelve a intentarlo.';
            noResultsMessage.style.display = 'block';
            console.error("Error al cargar datos de Google Sheets:", error);
        }
    };

    const renderTable = () => {
        tableBody.innerHTML = '';
        const filteredDeliverables = deliverables.filter(d => {
            const searchMatch = !searchQuery ||
                                (d.descripcion || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                                (d.documento || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (d.documentoExterno || '').toLowerCase().includes(searchQuery.toLowerCase());
            const monthMatch = !monthFilter || d.mesPago === monthFilter;
            return searchMatch && monthMatch;
        });
        
        if (filteredDeliverables.length === 0) {
            noResultsMessage.style.display = 'block';
            if(searchQuery || monthFilter){
                 noResultsMessage.textContent = 'No se encontraron entregables que coincidan con los filtros.';
            } else if (deliverables.length > 0) {
                 noResultsMessage.textContent = 'No hay resultados para los filtros actuales.';
            } else {
                 noResultsMessage.textContent = 'Aún no hay entregables registrados. ¡Añade uno nuevo!';
            }
        } else {
            noResultsMessage.style.display = 'none';
        }

        filteredDeliverables.sort((a, b) => b.id - a.id).forEach(d => {
            const row = document.createElement('tr');
            // Si el ID es temporal (negativo), añade un estilo para indicar que se está guardando
            if (d.id < 0) {
                row.style.opacity = '0.6';
            }
            const [year, month, day] = d.fechaPresentacion ? String(d.fechaPresentacion).split('T')[0].split('-') : ['','',''];
            const formattedDate = day ? `${day}/${month}/${year}` : 'N/A';
            
            const linkCellHTML = d.documentoUrl ? `
                <a href="${d.documentoUrl}" target="_blank" rel="noopener noreferrer" class="document-link" title="Abrir documento">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>` : '';

            row.innerHTML = `
                <td>${d.descripcion || 'N/A'}</td>
                <td>${d.documento || 'N/A'}</td>
                <td>${d.documentoExterno || 'N/A'}</td>
                <td>$${(d.monto || 0).toLocaleString('es-MX')}</td>
                <td>
                    <div class="progress-container">
                        <div class="progress-bar-wrapper">
                            <div class="progress-bar-fill" style="width: ${d.porcentajePago || 0}%;"></div>
                        </div>
                        <span class="progress-text">${(parseFloat(d.porcentajePago) || 0).toFixed(2)}%</span>
                    </div>
                </td>
                <td>${formattedDate}</td>
                <td>${d.mesPago || 'N/A'}</td>
                <td><span class="status status-${(d.estado || 'pendiente').toLowerCase().replace(/\s/g, '-')}">${d.estado || 'Pendiente'}</span></td>
                <td style="text-align: center;">${linkCellHTML}</td>
                <td>
                    <button class="action-btn edit-btn" data-id="${d.id}" aria-label="Editar ${d.descripcion || ''}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                    <button class="action-btn delete-btn" data-id="${d.id}" aria-label="Eliminar ${d.descripcion || ''}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    };
    
    const populateMonthFilter = () => {
        const allMonths = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const presentMonths = [...new Set(deliverables.map(d => d.mesPago))].filter(Boolean);
        presentMonths.sort((a, b) => allMonths.indexOf(a) - allMonths.indexOf(b));
        
        const currentSelection = monthFilterSelect.value;
        monthFilterSelect.innerHTML = '<option value="">Todos los Meses</option>';
        presentMonths.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = month;
            monthFilterSelect.appendChild(option);
        });
        monthFilterSelect.value = currentSelection;
    };

    const switchTab = (targetId) => {
        const currentViewId = document.querySelector('.view.active')?.id;
        if (currentViewId === 'cargar' && targetId !== 'cargar' && isFormDirty) {
            if (!confirm('Tienes cambios sin guardar. ¿Seguro que quieres salir?')) return;
        }
        views.forEach(v => v.classList.remove('active'));
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        document.querySelector(`[data-target="${targetId}"]`).classList.add('active');
        if (currentViewId === 'cargar' && targetId !== 'cargar') resetFormState();
    };

    const resetFormState = () => {
        form.reset();
        editingDeliverableId = null;
        document.getElementById('form-title').textContent = 'Cargar Nuevo Entregable';
        submitButton.textContent = 'Guardar Entregable';
        cancelButton.style.display = 'none';
        resetFormDirtyState();
    };

    const startEdit = (id) => {
        const deliverable = deliverables.find(d => d.id === id);
        if (!deliverable) return;
        editingDeliverableId = id;
        document.getElementById('descripcion').value = deliverable.descripcion || '';
        document.getElementById('monto').value = deliverable.monto || '';
        document.getElementById('porcentaje-pago').value = deliverable.porcentajePago || '';
        document.getElementById('fecha-presentacion').value = deliverable.fechaPresentacion ? String(deliverable.fechaPresentacion).split('T')[0] : '';
        document.getElementById('mes-pago').value = deliverable.mesPago || '';
        document.getElementById('estado').value = deliverable.estado || 'Pendiente';
        document.getElementById('documento-interno').value = deliverable.documento || '';
        document.getElementById('documento-externo').value = deliverable.documentoExterno || '';
        document.getElementById('documento-url').value = deliverable.documentoUrl || '';
        document.getElementById('form-title').textContent = 'Editando Entregable';
        submitButton.textContent = 'Actualizar Cambios';
        cancelButton.style.display = 'inline-block';
        switchTab('cargar');
    };
    
    const exportToExcel = () => {
        const filteredData = deliverables.filter(d => {
            const searchMatch = !searchQuery ||
                                (d.descripcion || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (d.documento || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (d.documentoExterno || '').toLowerCase().includes(searchQuery.toLowerCase());
            const monthMatch = !monthFilter || d.mesPago === monthFilter;
            return searchMatch && monthMatch;
        });

        if (filteredData.length === 0) {
            showError("No hay datos para exportar con los filtros actuales.");
            return;
        }

        const dataToExport = filteredData.map(d => ({
            'ID': d.id,
            'Descripción': d.descripcion,
            'Documento Interno': d.documento,
            'Documento Externo': d.documentoExterno,
            'Monto': d.monto,
            'Porcentaje de Pago (%)': d.porcentajePago,
            'Fecha de Presentación': d.fechaPresentacion ? new Date(d.fechaPresentacion).toLocaleDateString('es-MX') : '',
            'Mes de Pago': d.mesPago,
            'Estado': d.estado,
            'Enlace': d.documentoUrl
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Entregables");
        XLSX.writeFile(workbook, "Reporte_Entregables.xlsx");
    };

    // --- Event Listeners ---
    tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.target)));
    form.addEventListener('input', setFormDirty);
    errorCloseBtn.addEventListener('click', hideError);
    successCloseBtn.addEventListener('click', hideSuccess);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const deliverableData = {
            descripcion: formData.get('descripcion'),
            monto: parseFloat(formData.get('monto')) || 0,
            porcentajePago: parseFloat(formData.get('porcentaje-pago')) || 0,
            fechaPresentacion: formData.get('fecha-presentacion'),
            mesPago: formData.get('mes-pago'),
            estado: formData.get('estado'),
            documento: formData.get('documento-interno'),
            documentoExterno: formData.get('documento-externo'),
            documentoUrl: formData.get('documento-url'),
        };

        if (editingDeliverableId) {
            // --- Lógica de EDICIÓN (con loader) ---
            submitButton.disabled = true;
            deliverableData.id = editingDeliverableId;
            try {
                const result = await fetchWithHandling(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'save', data: deliverableData })
                }, 'Actualizando...');

                if (result.status !== 'success') throw new Error(result.message);
                
                showSuccess('Entregable actualizado.');
                await loadDeliverables(); // Recarga completa para asegurar consistencia
                resetFormState();
                switchTab('consultar');
            } catch (error) {
                console.error("Error actualizando datos:", error);
            } finally {
                submitButton.disabled = false;
            }
        } else {
            // --- Lógica de CREACIÓN (Optimista, sin loader) ---
            const tempId = -Date.now(); // ID temporal y negativo para identificarlo
            const tempDeliverable = { ...deliverableData, id: tempId };

            // 1. Actualización optimista en la UI
            deliverables.unshift(tempDeliverable);
            resetFormState();
            switchTab('consultar');
            showSuccess('Guardando entregable...');

            // 2. Envío en segundo plano
            try {
                const result = await fetchWithHandling(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'save', data: deliverableData })
                }); // Sin mensaje de carga

                if (result.status !== 'success') throw new Error(result.message);

                // 3. Sincronizar el registro con los datos reales del servidor (incluido el ID final)
                const savedDeliverable = result.data;
                const index = deliverables.findIndex(d => d.id === tempId);
                if (index !== -1) {
                    deliverables[index] = savedDeliverable;
                }
                showSuccess('Entregable guardado correctamente.');
            } catch (error) {
                // 4. Revertir si falla
                showError('Error al guardar. El registro ha sido descartado.');
                deliverables = deliverables.filter(d => d.id !== tempId);
                console.error("Error guardando datos:", error);
            } finally {
                // 5. Renderizar la tabla para reflejar el estado final (ya sea con el ID correcto o sin el registro)
                renderTable();
                populateMonthFilter();
            }
        }
    });

    tableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            startEdit(parseInt(editBtn.dataset.id, 10));
            return;
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const id = parseInt(deleteBtn.dataset.id, 10);
            if (!confirm('¿Estás seguro de que quieres eliminar este entregable? Esta acción es permanente y no se puede deshacer.')) return;
            
            const indexToDelete = deliverables.findIndex(d => d.id === id);
            if (indexToDelete === -1) return;

            const deletedDeliverable = deliverables[indexToDelete];
            
            // Actualización optimista
            deliverables.splice(indexToDelete, 1);
            renderTable();

            try {
                const result = await fetchWithHandling(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'delete', id: id })
                }, 'Eliminando...');

                if (result.status !== 'success') throw new Error(result.message);
                showSuccess('Entregable eliminado.');
                populateMonthFilter();
            } catch (error) {
                // Revertir el cambio si falla la API
                showError('Error al eliminar. El registro ha sido restaurado.');
                deliverables.splice(indexToDelete, 0, deletedDeliverable);
                renderTable();
                console.error("Error eliminando datos:", error);
            }
        }
    });

    cancelButton.addEventListener('click', () => {
        resetFormState();
        switchTab('consultar');
    });
    
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTable();
    });
    
    monthFilterSelect.addEventListener('change', (e) => {
        monthFilter = e.target.value;
        renderTable();
    });
    
    exportButton.addEventListener('click', exportToExcel);

    window.addEventListener('beforeunload', (e) => {
        if (isFormDirty) {
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    });

    // --- Carga Inicial ---
    switchTab('consultar');
    loadDeliverables();
});
