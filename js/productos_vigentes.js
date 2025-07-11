document.addEventListener('DOMContentLoaded', () => {
    // Verificar si estamos en la sección correcta
    const section = document.getElementById('section-productos-vigentes');
    if (!section) return;

    const form = document.getElementById('evaluacionForm');
    const resultado = document.getElementById('resultadoProductos');
    const historial = document.getElementById('historialEvaluaciones');
    const busquedaInput = document.getElementById('busquedaSolicitud');
    const reglasAplicadas = document.getElementById('reglasAplicadas');

    if (!form || !resultado || !historial) {
        console.error("Elementos del DOM no encontrados");
        return;
    }

    const campos = [
        'solicitud', 'edad', 'segmento', 'maf', 'productoFisico',
        'ingresos', 'estadoCivil', 'marca', 'scoreBuro', 'pais'
    ];

    let editandoId = null;
    let reglasCache = [];

    // Función para evaluar si un producto aplica
    function evaluarProducto(regla, entrada) {
        return regla.condiciones?.every(cond => {
            const valorCampo = entrada[cond.campo];
            const operador = cond.operador;
            const valor = cond.valor;

            if (operador === 'entre') {
                const [min, max] = valor.split('-').map(Number);
                return valorCampo >= min && valorCampo <= max;
            }

            if (operador === 'in') {
                const opciones = valor.split(',').map(v => v.trim());
                return opciones.includes(valorCampo?.toString());
            }

            switch (operador) {
                case '==': return valorCampo == valor;
                case '!=': return valorCampo != valor;
                case '>': return valorCampo > Number(valor);
                case '<': return valorCampo < Number(valor);
                case '>=': return valorCampo >= Number(valor);
                case '<=': return valorCampo <= Number(valor);
                default: return false;
            }
        });
    }

    async function obtenerReglas() {
        if (reglasCache.length === 0) {
            const snapshot = await firebase.firestore().collection('productos_parametrizados').get();
            reglasCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        return reglasCache;
    }

    // Función para cargar el historial de evaluaciones
    async function cargarHistorial() {
        const fechaDesde = document.getElementById('fechaDesde').value;
        const fechaHasta = document.getElementById('fechaHasta').value;

        try {
            let query = firebase.firestore().collection('evaluacionesProductos').orderBy('evaluadoEn', 'desc');
            
            const snapshot = await query.get();
            historial.innerHTML = '';
            
            if (snapshot.empty) {
                historial.innerHTML = '<tr><td colspan="5" class="text-muted">No hay evaluaciones registradas</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                const fechaEval = new Date(data.evaluadoEn);
                
                // Filtrar por fechas si están especificadas
                if (fechaDesde && fechaEval < new Date(fechaDesde)) return;
                if (fechaHasta && fechaEval > new Date(fechaHasta + 'T23:59:59')) return;

                const fila = document.createElement('tr');
                fila.innerHTML = `
                    <td>${data.solicitud || '-'}</td>
                    <td>${data.evaluadoPor || '-'}</td>
                    <td>${fechaEval.toLocaleString()}</td>
                    <td>${(data.productosAplicables || []).join('<br>')}</td>
                    <td>
                        <button class="btn btn-sm btn-warning editar-evaluacion" data-id="${doc.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                `;
                historial.appendChild(fila);
            });

            // Agregar event listeners a los botones de edición
            document.querySelectorAll('.editar-evaluacion').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    const doc = await firebase.firestore().collection('evaluacionesProductos').doc(id).get();
                    
                    if (!doc.exists) return;
                    
                    const data = doc.data();
                    campos.forEach(c => {
                        const element = document.getElementById(c);
                        if (element) element.value = data[c] || '';
                    });
                    
                    resultado.innerHTML = (data.productosAplicables || []).map(p =>
                        `<li class="list-group-item"><i class="fas fa-check-circle text-success me-2"></i>${p}</li>`
                    ).join('');
                    
                    editandoId = id;
                    window.scrollTo(0, 0);
                });
            });

        } catch (error) {
            console.error('Error al cargar historial:', error);
            historial.innerHTML = '<tr><td colspan="5" class="text-danger">Error al cargar historial</td></tr>';
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        resultado.innerHTML = '<li class="list-group-item">Evaluando...</li>';
        reglasAplicadas.innerHTML = '<p class="text-muted">Calculando reglas aplicadas...</p>';

        const entrada = {};
        campos.forEach(c => {
            entrada[c] = document.getElementById(c).value.trim();
        });

        // Convertir valores numéricos
        entrada.edad = parseInt(entrada.edad) || 0;
        entrada.maf = parseFloat(entrada.maf) || 0;
        entrada.ingresos = parseFloat(entrada.ingresos) || 0;
        entrada.scoreBuro = parseFloat(entrada.scoreBuro) || 0;

        try {
            const user = firebase.auth().currentUser;
            const reglas = await obtenerReglas();
            const resultados = [];
            const reglasAplicadasList = [];

            reglas.forEach(data => {
                if (evaluarProducto(data, entrada)) {
                    resultados.push({
                        producto: data.resultado || "Producto sin nombre",
                        color: data.color || "#007bff"
                    });
                    reglasAplicadasList.push(data);
                }
            });

            // Mostrar resultados
            const resultadoFinal = resultados.length > 0 
                ? resultados 
                : [{ producto: "No se encontraron productos aplicables", color: "#666" }];
            
            resultado.innerHTML = resultadoFinal.map(r =>
                `<li class="list-group-item" style="color: ${r.color}">
                    <i class="fas fa-check-circle me-2"></i>${r.producto}
                </li>`
            ).join('');

            // Mostrar reglas aplicadas
            reglasAplicadas.innerHTML = reglasAplicadasList.length > 0
                ? `<ul class="list-unstyled">${reglasAplicadasList.map(r => 
                    `<li class="mb-2">
                        <strong>${r.resultado}</strong><br>
                        <small>${r.condiciones.map(c => `${c.campo} ${c.operador} ${c.valor}`).join(', ')}</small>
                    </li>`
                ).join('')}</ul>`
                : '<p class="text-muted">No se aplicaron reglas</p>';

            // Guardar historial
            const ref = firebase.firestore().collection('evaluacionesProductos');
            const payload = {
                ...entrada,
                productosAplicables: resultados.map(r => r.producto),
                evaluadoPor: user ? user.email : "Desconocido",
                evaluadoEn: new Date().toISOString()
            };

            if (editandoId) {
                await ref.doc(editandoId).set(payload);
                editandoId = null;
            } else {
                await ref.add(payload);
            }

            // Actualizar historial
            await cargarHistorial();
        } catch (error) {
            console.error('Error al evaluar productos:', error);
            resultado.innerHTML = '<li class="list-group-item text-danger">Error al evaluar productos.</li>';
            reglasAplicadas.innerHTML = '<p class="text-danger">Error al evaluar reglas</p>';
        }
    });

    // Buscar en el historial
    if (busquedaInput) {
        busquedaInput.addEventListener('input', () => {
            const val = busquedaInput.value.toLowerCase();
            const rows = historial.querySelectorAll('tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(val) ? '' : 'none';
            });
        });
    }

    // Cargar historial al inicio
    cargarHistorial();
});