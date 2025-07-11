console.log("✅ productos.js CARGADO");

document.addEventListener("DOMContentLoaded", () => {
  try {
    // Verificar si estamos en la página correcta
    const productosSection = document.getElementById('section-productos');
    if (!productosSection) {
      console.log("No se encontró la sección de productos, saliendo...");
      return;
    }

    // Elementos del DOM
    const form = document.getElementById("productoForm");
    const listaCondiciones = document.getElementById("listaCondiciones");
    const agregarBtn = document.getElementById("agregarCondicion");
    const guardarBtn = document.getElementById("guardarProducto");
    const productosRegistrados = document.getElementById("productosRegistrados");
    
    // Verificar que todos los elementos existen
    if (!form || !listaCondiciones || !agregarBtn || !guardarBtn || !productosRegistrados) {
      console.error("No se encontraron todos los elementos necesarios");
      return;
    }

    // Array para almacenar condiciones temporalmente
    let condiciones = [];

    // Agregar campo País al formulario si no existe
    if (!document.getElementById('pais')) {
      const paisSelect = document.createElement("div");
      paisSelect.className = "col-md-4";
      paisSelect.innerHTML = `
        <label class="form-label">País</label>
        <select class="form-select" id="pais" required>
          <option value="">Seleccionar país</option>
          <option value="GT">Guatemala</option>
          <option value="SV">El Salvador</option>
          <option value="HN">Honduras</option>
        </select>
      `;
      form.querySelector(".row.g-3").insertBefore(paisSelect, form.querySelector(".col-md-2"));
    }

    // Evento para agregar condiciones
    agregarBtn.addEventListener("click", () => {
      const campo = document.getElementById("campo").value;
      const operador = document.getElementById("operador").value;
      const valor = document.getElementById("valor").value.trim();

      if (!campo || !operador || !valor) {
        alert("Todos los campos son obligatorios");
        return;
      }

      const condicion = { campo, operador, valor };
      condiciones.push(condicion);

      const item = document.createElement("li");
      item.className = "list-group-item d-flex justify-content-between align-items-center";
      item.innerHTML = `
        <span><strong>${campo}</strong> ${operador} ${valor}</span>
        <button class="btn btn-sm btn-danger"><i class="fas fa-trash"></i></button>
      `;

      item.querySelector("button").addEventListener("click", () => {
        listaCondiciones.removeChild(item);
        const index = condiciones.findIndex(c => 
          c.campo === condicion.campo && 
          c.operador === condicion.operador && 
          c.valor === condicion.valor
        );
        if (index > -1) condiciones.splice(index, 1);
      });

      listaCondiciones.appendChild(item);

      // Limpiar campos (excepto operador)
      document.getElementById("campo").value = "";
      document.getElementById("valor").value = "";
    });

    // Evento para guardar producto
    guardarBtn.addEventListener("click", async () => {
      const resultado = document.getElementById("resultadoEsperado").value.trim();
      const pais = document.getElementById("pais").value;

      if (condiciones.length === 0 || !resultado || !pais) {
        alert("Agrega al menos una condición, define un resultado esperado y selecciona un país.");
        return;
      }

      const currentUser = firebase.auth().currentUser;
      const userEmail = currentUser?.email || "Desconocido";

      const producto = {
        condiciones,
        resultado,
        pais,
        creadoPor: currentUser?.uid || null,
        nombreUsuario: userEmail,
        fecha: new Date().toISOString()
      };

      try {
        // Mostrar feedback al usuario
        guardarBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Guardando...';
        guardarBtn.disabled = true;

        // Guardar en Firebase
        await firebase.firestore().collection("productos_parametrizados").add(producto);
        
        // Limpiar formulario
        condiciones = [];
        listaCondiciones.innerHTML = "";
        document.getElementById("resultadoEsperado").value = "";
        document.getElementById("pais").value = "";
        
        // Mostrar éxito
        guardarBtn.innerHTML = '<i class="fas fa-check me-2"></i>Guardado!';
        setTimeout(() => {
          guardarBtn.innerHTML = '<i class="fas fa-save me-2"></i>Guardar parametrización';
          guardarBtn.disabled = false;
        }, 2000);

        // Recargar lista de productos
        cargarProductosRegistrados();
      } catch (error) {
        console.error("Error al guardar producto:", error);
        alert("Error al guardar: " + error.message);
        guardarBtn.innerHTML = '<i class="fas fa-save me-2"></i>Guardar parametrización';
        guardarBtn.disabled = false;
      }
    });

    // Función para cargar productos registrados
    async function cargarProductosRegistrados() {
      productosRegistrados.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin me-2"></i>Cargando productos...</div>';

      try {
        const snapshot = await firebase.firestore()
          .collection("productos_parametrizados")
          .orderBy("fecha", "desc")
          .limit(50)
          .get();

        if (snapshot.empty) {
          productosRegistrados.innerHTML = '<div class="text-center text-muted py-3">No hay productos registrados</div>';
          return;
        }

        productosRegistrados.innerHTML = '';
        
        snapshot.forEach(doc => {
          const data = doc.data();
          const fecha = new Date(data.fecha).toLocaleString();
          
          const card = document.createElement("div");
          card.className = "col-md-4 mb-3";
          card.innerHTML = `
            <div class="card h-100">
              <div class="card-header bg-light">
                <h6 class="mb-0">${data.resultado}</h6>
                <small class="text-muted">${data.pais || 'Sin país'}</small>
              </div>
              <div class="card-body">
                <ul class="list-unstyled small mb-3">
                  ${data.condiciones.map(c => 
                    `<li><strong>${c.campo}</strong> ${c.operador} ${c.valor}</li>`
                  ).join('')}
                </ul>
              </div>
              <div class="card-footer bg-transparent">
                <small class="text-muted">Creado por: ${data.nombreUsuario}</small>
                <small class="d-block">${fecha}</small>
                <button class="btn btn-sm btn-outline-danger mt-2 w-100" onclick="eliminarProducto('${doc.id}')">
                  <i class="fas fa-trash me-1"></i> Eliminar
                </button>
              </div>
            </div>
          `;
          
          productosRegistrados.appendChild(card);
        });
      } catch (error) {
        console.error("Error al cargar productos:", error);
        productosRegistrados.innerHTML = `
          <div class="alert alert-danger text-center">
            <i class="fas fa-exclamation-triangle me-2"></i>
            Error al cargar productos: ${error.message}
          </div>
        `;
      }
    }

    // Función global para eliminar productos
    window.eliminarProducto = async (id) => {
      if (!confirm("¿Estás seguro de eliminar este producto?")) return;
      
      try {
        await firebase.firestore().collection("productos_parametrizados").doc(id).delete();
        cargarProductosRegistrados();
      } catch (error) {
        console.error("Error al eliminar producto:", error);
        alert("Error al eliminar: " + error.message);
      }
    };

    // Cargar productos al iniciar
    cargarProductosRegistrados();

  } catch (error) {
    console.error("Error en productos.js:", error);
  }
});