import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert, 
  Vibration, 
  TextInput, 
  SafeAreaView, 
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const CANALES_PREDEFINIDOS = ['General', 'Canal 1', 'Canal 2', 'Canal 3'];

export default function App() {
  const [pantallaActual, setPantallaActual] = useState('cargando'); 
  const [nombreIngresado, setNombreIngresado] = useState('');
  const [nombreUsuarioCompleto, setNombreUsuarioCompleto] = useState('');

  const [modoComunicacion, setModoComunicacion] = useState(''); 
  const [canalActivo, setCanalActivo] = useState('General');

  const [mensajes, setMensajes] = useState([]);
  const [textoMensaje, setTextoMensaje] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [emisorActual, setEmisorActual] = useState('');

  const [statusText, setStatusText] = useState('📻 CENTRAL EN LÍNEA');
  const [statusColor, setStatusColor] = useState('#2ed573');
  const [subText, setSubText] = useState('PULSA PARA HABLAR');
  const [isButtonActive, setIsButtonActive] = useState(false);

  // 📝 ESTADOS PARA EL MÓDULO DE REPORTES
  const [reportDescription, setReportDescription] = useState('');
  const [reportImageUri, setReportImageUri] = useState(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // 🟢 ESTADO Y PANEL DE USUARIOS CONECTADOS
  const [showUsersPanel, setShowUsersPanel] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);

  const ws = useRef(null);
  const recordingRef = useRef(null);
  const soundRef = useRef(null); 
  const flatListRef = useRef(null);

  const canalActivoRef = useRef(canalActivo);

  useEffect(() => {
    canalActivoRef.current = canalActivo;
  }, [canalActivo]);

  useEffect(() => {
    // ⏱️ Ajuste de tiempo del Splash inicial a 5 segundos
    const timer = setTimeout(() => {
      comprobarUsuario();
    }, 5000);
    
    configurarAudioInicial();

    return () => {
      clearTimeout(timer);
      if (ws.current) ws.current.close();
      descargarSound();
    };
  }, []);

  useEffect(() => {
    if (pantallaActual === 'chat') {
      cargarHistorialChat();
    }
  }, [canalActivo, pantallaActual]);

  const comprobarUsuario = async () => {
    try {
      const usuarioGuardado = await AsyncStorage.getItem('nombre_chofer');
      if (usuarioGuardado) {
        const nombreLimpio = usuarioGuardado.split(' #')[0];
        setNombreUsuarioCompleto(nombreLimpio);
        setNuevoNombre(nombreLimpio);
        conectarWebSocket(nombreLimpio);
        setPantallaActual('hub'); 
      } else {
        setPantallaActual('registro');
      }
    } catch (error) {
      console.log('Error al leer la memoria:', error);
      setPantallaActual('registro');
    }
  };

  const cargarHistorialChat = async () => {
    try {
      const historialGuardado = await AsyncStorage.getItem(`@chat_${canalActivo}`);
      if (historialGuardado) {
        setMensajes(JSON.parse(historialGuardado));
      } else {
        setMensajes([]);
      }
    } catch (error) {
      console.log('Error al cargar historial:', error);
    }
  };

  const guardarMensajeLocalmente = async (nuevoMsg, canalDestino) => {
    try {
      const historialActual = await AsyncStorage.getItem(`@chat_${canalDestino}`);
      let listaActualizada = [];
      if (historialActual) {
        listaActualizada = JSON.parse(historialActual);
      }
      listaActualizada.push(nuevoMsg);
      await AsyncStorage.setItem(`@chat_${canalDestino}`, JSON.stringify(listaActualizada));
      
      if (canalDestino === canalActivoRef.current) {
        setMensajes(listaActualizada);
      }
    } catch (error) {
      console.log('Error al guardar mensaje:', error);
    }
  };

  const manejarRegistro = async () => {
    if (nombreIngresado.trim() === '') return;

    const nombreLimpio = nombreIngresado.trim();

    try {
      await AsyncStorage.setItem('nombre_chofer', nombreLimpio);
      setNombreUsuarioCompleto(nombreLimpio);
      setNuevoNombre(nombreLimpio);
      conectarWebSocket(nombreLimpio);
      setPantallaActual('hub');
    } catch (error) {
      console.log('Error al guardar en la memoria:', error);
    }
  };

  const guardarNuevoNombre = async () => {
    if (nuevoNombre.trim() === '') return;

    const nombreLimpio = nuevoNombre.trim();

    try {
      await AsyncStorage.setItem('nombre_chofer', nombreLimpio);
      setNombreUsuarioCompleto(nombreLimpio);
      setIsEditing(false);

      if (ws.current) {
        ws.current.close();
      }
      
      Alert.alert("Éxito", "Nombre actualizado correctamente");
    } catch (error) {
      console.log('Error al actualizar el nombre:', error);
    }
  };

  const configurarAudioInicial = async () => {
    try {
      await Audio.requestPermissionsAsync();
    } catch (error) {
      console.error("Error al solicitar permisos de audio:", error);
    }
  };

  const descargarSound = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (e) {
        console.log("Error al descargar sonido previo:", e);
      }
      soundRef.current = null;
    }
  };

  const salirDelCanal = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'leave_channel',
        emisor: nombreUsuarioCompleto,
        sala: canalActivoRef.current
      }));
    }

    setConnectedUsers([]);
    setShowUsersPanel(false);
    setPantallaActual('hub');
  };

  const conectarWebSocket = (nombreIdentificador) => {

        // Evitar conexiones WebSocket duplicadas
    if (
      ws.current &&
      (ws.current.readyState === WebSocket.OPEN ||
       ws.current.readyState === WebSocket.CONNECTING)
    ) {
      console.log('WebSocket ya activo o conectando. Se evita conexión duplicada.');
      return;
    }
    ws.current = new WebSocket('wss://servidor-colectivos-la-punta.onrender.com');

    ws.current.onopen = () => {
      actualizarUI('📻 CENTRAL EN LÍNEA', '#2ed573', 'PULSA PARA HABLAR');
      
    };

    ws.current.onclose = () => {
      actualizarUI('❌ DESCONECTADO', '#ff4757', 'SIN SEÑAL');
      setTimeout(() => comprobarYReconectar(), 3000);
    };

    ws.current.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        // 👥 1. PROCESAR LISTA DE USUARIOS CONECTADOS
        if (data.type === 'lista_usuarios' || data.tipo === 'lista_usuarios') {
          const usuariosEnCanal = data.usuarios || [];
          const otrosUsuarios = usuariosEnCanal.filter(u => u.nombre !== nombreIdentificador && u.nombre !== nombreUsuarioCompleto);
          setConnectedUsers(otrosUsuarios);
          return;
        }

        // Filtro anti-eco
        if (data.emisor === nombreIdentificador || data.emisor === nombreUsuarioCompleto) {
          return; 
        }

        const salaRecibida = data.sala || data.canal || data.room || 'General';

        // 🎙️ 2. PROCESAR AUDIO
        if ((data.type === 'nuevo_audio' || data.tipo === 'nuevo_audio' || data.url) && data.url) {
          if (salaRecibida !== canalActivoRef.current) {
            return; 
          }
          setEmisorActual(data.emisor || 'Compañero');
          await descargarYReproducirAudio(data.url);
          return;
        }

        // 💬 3. PROCESAR MENSAJES DE TEXTO
        const esMensajeTexto = data.type === 'nuevo_mensaje_texto' || data.tipo === 'nuevo_mensaje_texto' || data.texto || data.mensaje;
        
        if (esMensajeTexto && !data.url) {
          const contenidoTexto = data.texto || data.mensaje || '';
          const emisorMsg = data.emisor || 'Compañero';
          
          const mensajeEntrante = {
            id: data.id || Date.now().toString(),
            emisor: emisorMsg,
            texto: contenidoTexto,
            timestamp: data.timestamp || new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
          };
          
          await guardarMensajeLocalmente(mensajeEntrante, salaRecibida);
        }

      } catch (error) {
        console.log("Dato recibido no válido:", event.data);
      }
    };
  };

  const enviarMensajeTexto = () => {
    if (textoMensaje.trim() === '' || !ws.current) return;

    const ahora = new Date();
    const horaFormateada = `${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`;
    
    const objetoMensaje = {
      type: 'nuevo_mensaje_texto',
      tipo: 'nuevo_mensaje_texto', 
      sala: canalActivo,          
      canal: canalActivo,          
      room: canalActivo,          
      emisor: nombreUsuarioCompleto,
      texto: textoMensaje.trim(),
      mensaje: textoMensaje.trim(), 
      timestamp: horaFormateada,
      id: Date.now().toString()
    };

    ws.current.send(JSON.stringify(objetoMensaje));
    guardarMensajeLocalmente(objetoMensaje, canalActivo);
    setTextoMensaje('');
  };

  const comprobarYReconectar = async () => {
    const usuarioActual = await AsyncStorage.getItem('nombre_chofer') || nombreUsuarioCompleto;
    conectarWebSocket(usuarioActual);
  };

  const actualizarUI = (texto, color, secundario) => {
    setStatusText(texto);
    setStatusColor(color);
    setSubText(secundario);
  };

  const descargarYReproducirAudio = async (urlRemota) => {
    try {
      actualizarUI('📥 DESCARGANDO AUDIO...', '#a4b0be', 'TRANSMISIÓN ENTRANTE');
      
      const nombreArchivo = `audio_${Date.now()}.m4a`;
      const rutaLocal = `${FileSystem.cacheDirectory}${nombreArchivo}`;
      const resultadoDescarga = await FileSystem.downloadAsync(urlRemota, rutaLocal);

      const infoArchivo = await FileSystem.getInfoAsync(resultadoDescarga.uri);
      if (!infoArchivo.exists) {
        return;
      }

      actualizarUI('🔊 ESCUCHANDO RUTA...', '#eccc68', 'TRANSMISIÓN ENTRANTE');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: false,
        staysActiveInBackground: true
      });

      await descargarSound();

      const { sound } = await Audio.Sound.createAsync(
        { uri: resultadoDescarga.uri },
        { shouldPlay: false, volume: 1.0, playThroughEarpieceAndroid: false, shouldDuckAndroid: false },
        (playbackStatus) => {
          if (playbackStatus.didJustFinish) {
            actualizarUI('📻 CENTRAL EN LÍNEA', '#2ed573', 'PULSA PARA HABLAR');
            descargarSound();
            setEmisorActual('');
          }
        }
      );

      soundRef.current = sound;
      await soundRef.current.setVolumeAsync(1.0);
      await soundRef.current.setPositionAsync(0);
      await soundRef.current.playAsync();

    } catch (error) {
      actualizarUI('⚠️ ERROR DE AUDIO', '#ff4757', 'PULSA PARA INTENTAR');
      descargarSound();
      setEmisorActual('');
    }
  };

  const iniciarTransmision = async () => {
    try {
      Vibration.vibrate(80);
      await descargarSound();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: false,
        staysActiveInBackground: true
      });

      const opcionesGrabacion = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MEDIUM,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 64000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      };

      const { recording } = await Audio.Recording.createAsync(opcionesGrabacion);
      recordingRef.current = recording;
      setIsButtonActive(true);
      actualizarUI('🎙️ TRANSMITIENDO...', '#ff4757', 'SUELTA PARA ENVIAR');
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo activar el micrófono.");
    }
  };

  const finalizarTransmision = async () => {
    if (!recordingRef.current) return;

    try {
      setIsButtonActive(false);
      actualizarUI('📥 ENVIANDO AUDIO...', '#a4b0be', 'PROCESANDO TRANSMISIÓN');

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error("No se generó URI de grabación");

      const formData = new FormData();
      formData.append('emisor', nombreUsuarioCompleto);
      formData.append('sala', canalActivo); 
      formData.append('canal', canalActivo); 
      formData.append('room', canalActivo); 
      formData.append('audio', {
        uri: uri,
        name: 'audio.m4a',
        type: 'audio/m4a',
      });

      await fetch('https://servidor-colectivos-la-punta.onrender.com/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      actualizarUI('📻 CENTRAL EN LÍNEA', '#2ed573', 'PULSA PARA HABLAR');
    } catch (error) {
      actualizarUI('❌ ERROR AL ENVIAR', '#ff4757', 'FALLO DE RED');
    }
  };

  // 📷 FUNCIÓN PARA SELECCIONAR/TOMAR FOTO EN REPORTES
  const tomarOSeleccionarFoto = async () => {
    Alert.alert(
      "Evidencia Fotográfica",
      "Selecciona la fuente de la imagen",
      [
        {
          text: "📷 Cámara",
          onPress: async () => {
            const permissions = await ImagePicker.requestCameraPermissionsAsync();
            if (!permissions.granted) {
              Alert.alert("Permiso requerido", "Se necesita acceso a la cámara.");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 0.7,
            });
            if (!result.canceled) {
              setReportImageUri(result.assets[0].uri);
            }
          }
        },
        {
          text: "🖼️ Galería",
          onPress: async () => {
            const permissions = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissions.granted) {
              Alert.alert("Permiso requerido", "Se necesita acceso a la galería.");
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              quality: 0.7,
            });
            if (!result.canceled) {
              setReportImageUri(result.assets[0].uri);
            }
          }
        },
        { text: "Cancelar", style: "cancel" }
      ]
    );
  };

  // ✉️ ENVIAR REPORTE AL SERVIDOR
  const enviarReporteIncidencia = async () => {
    if (!reportDescription.trim()) {
      Alert.alert("Campo Requerido", "Por favor ingresa la descripción de la novedad u incidencia.");
      return;
    }

    setIsSubmittingReport(true);

    try {
      const formData = new FormData();
      formData.append('author', nombreUsuarioCompleto);
      formData.append('dateTime', new Date().toLocaleString('es-CL'));
      formData.append('description', reportDescription.trim());

      if (reportImageUri) {
        const filename = reportImageUri.split('/').pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;
        formData.append('photo', {
          uri: reportImageUri,
          name: filename || 'foto.jpg',
          type: type,
        });
      }

      await fetch('https://servidor-colectivos-la-punta.onrender.com/report', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      Alert.alert("✅ Reporte Enviado", "El reporte ha sido registrado exitosamente.");
      setReportDescription('');
      setReportImageUri(null);
      setPantallaActual('hub');

    } catch (error) {
      Alert.alert("Error", "No se pudo conectar con el servidor para enviar el reporte.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // 📝 PANTALLA 1: REGISTRO
  if (pantallaActual === 'registro') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.tarjetaCentrada}>
          <Text style={styles.tituloBienvenida}>¡Bienvenido! 👋</Text>
          <Text style={styles.subtituloBienvenida}>Identifícate para ingresar al sistema de control</Text>
          
          <TextInput
            style={styles.entradaTexto}
            placeholder="Ej. Guardia Juan Perez..."
            placeholderTextColor="#888"
            value={nombreIngresado}
            onChangeText={setNombreIngresado}
            maxLength={25}
          />

          <TouchableOpacity style={styles.botonVerde} onPress={manejarRegistro}>
            <Text style={styles.textoBotonVerde}>Ingresar al Sistema</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 🧭 PANTALLA 2: MENÚ PRINCIPAL (HUB)
  if (pantallaActual === 'hub') {
    return (
      <SafeAreaView style={styles.hubScreen}>
        <View style={styles.hubHeader}>
          <View>
            <Text style={styles.hubEyebrow}>CENTRAL OPERATIVA</Text>
            <Text style={styles.hubBrand}>Colectivos La Punta</Text>
          </View>
          <View style={styles.hubEstado}>
            <View style={styles.hubEstadoDot} />
            <Text style={styles.hubEstadoTexto}>EN LÍNEA</Text>
          </View>
        </View>

        <View style={styles.hubDivider} />

        <View style={styles.hubIntro}>
          <Text style={styles.hubSaludo}>Panel de comunicaciones</Text>
          <Text style={styles.hubDescripcion}>Selecciona una función para comenzar</Text>
        </View>

        <View style={styles.hubActions}>
          <TouchableOpacity
            style={[styles.hubAction, styles.hubActionPrincipal]}
            activeOpacity={0.8}
            onPress={() => {
              setModoComunicacion('radio');
              setPantallaActual('selector_canal');
            }}
          >
            <View style={styles.hubIconBox}>
              <Text style={styles.hubIcon}>🎙️</Text>
            </View>
            <View style={styles.hubActionText}>
              <Text style={styles.hubActionLabel}>RADIO</Text>
              <Text style={styles.hubActionTitle}>Walkie-Talkie</Text>
              <Text style={styles.hubActionDescription}>Comunicación PTT en tiempo real</Text>
            </View>
            <Text style={styles.hubArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hubAction}
            activeOpacity={0.8}
            onPress={() => {
              setModoComunicacion('chat');
              setPantallaActual('selector_canal');
            }}
          >
            <View style={styles.hubIconBox}>
              <Text style={styles.hubIcon}>💬</Text>
            </View>
            <View style={styles.hubActionText}>
              <Text style={styles.hubActionLabel}>MENSAJERÍA</Text>
              <Text style={styles.hubActionTitle}>Chat de canales</Text>
              <Text style={styles.hubActionDescription}>Mensajes entre conductores y central</Text>
            </View>
            <Text style={styles.hubArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.hubAction, styles.hubActionReporte]}
            activeOpacity={0.8}
            onPress={() => setPantallaActual('reportes')}
          >
            <View style={[styles.hubIconBox, styles.hubIconBoxReporte]}>
              <Text style={styles.hubIcon}>🚨</Text>
            </View>
            <View style={styles.hubActionText}>
              <Text style={[styles.hubActionLabel, { color: '#f59e0b' }]}>INCIDENCIAS</Text>
              <Text style={styles.hubActionTitle}>Generar reporte</Text>
              <Text style={styles.hubActionDescription}>Fotografías y novedades para central</Text>
            </View>
            <Text style={styles.hubArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hubFooter}>
          <TouchableOpacity
            style={styles.hubSettings}
            activeOpacity={0.7}
            onPress={() => setPantallaActual('configuracion')}
          >
            <Text style={styles.hubSettingsIcon}>⚙️</Text>
            <Text style={styles.hubSettingsText}>Configuración</Text>
          </TouchableOpacity>
          <Text style={styles.hubVersion}>LA PUNTA · SISTEMA DE TERRENO</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 🎛️ PANTALLA 3: SELECTOR DE CANALES
  if (pantallaActual === 'selector_canal') {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <View style={styles.tarjetaCentrada}>
          <Text style={styles.tituloConfig}>Selecciona un Canal 🎛️</Text>
          <Text style={styles.subtituloBienvenida}>
            Modo seleccionado: {modoComunicacion === 'radio' ? '🎙️ Radio PTT' : '💬 Chat'}
          </Text>

          {CANALES_PREDEFINIDOS.map((canal, index) => (
            <TouchableOpacity
              key={index}
              style={styles.botonCanalItem}
              onPress={() => {
                setCanalActivo(canal);
                if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                  ws.current.send(JSON.stringify({
                    type: 'join_channel',
                    emisor: nombreUsuarioCompleto,
                    sala: canal
                  }));
                }
                setPantallaActual(modoComunicacion === 'radio' ? 'walkie' : 'chat');
              }}
            >
              <Text style={styles.textoBotonCanalItem}>🔹 {canal}</Text>
              <Text style={styles.textoFlechaCanal}>▶</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity 
            style={[styles.botonVolver, { marginTop: 20 }]} 
            onPress={() => setPantallaActual('hub')}
          >
            <Text style={styles.textoBotonVolver}>Volver al Menú</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 🚨 PANTALLA 4: GENERAR REPORTE
  if (pantallaActual === 'reportes') {
    const fechaHoraActual = new Date().toLocaleString('es-CL');

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 20 }}>
          <View style={styles.headerDisplay}>
            <View style={styles.headerFilaSuperior}>
              <Text style={styles.brandText}>🚨 Registro de Novedades</Text>
              <TouchableOpacity onPress={() => setPantallaActual('hub')} style={styles.areaEngranaje}>
                <Text style={styles.textoEngranaje}>🏠</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.choferTag}>Emisor: {nombreUsuarioCompleto}</Text>
          </View>

          <View style={[styles.tarjetaCentrada, { marginTop: 15 }]}>
            <Text style={[styles.tituloConfig, { marginBottom: 15, fontSize: 18 }]}>Módulo de Reporte</Text>

            <View style={{ width: '100%', marginBottom: 12 }}>
              <Text style={{ color: '#a4b0be', fontSize: 12, marginBottom: 4 }}>Fecha y Hora Automática:</Text>
              <TextInput style={styles.inputDisabled} value={fechaHoraActual} editable={false} />
            </View>

            <View style={{ width: '100%', marginBottom: 12 }}>
              <Text style={{ color: '#a4b0be', fontSize: 12, marginBottom: 4 }}>Detalle de la Incidencia / Novedad:</Text>
              <TextInput 
                style={[styles.entradaTexto, { height: 90, borderRadius: 12, paddingTop: 10, textAlignVertical: 'top' }]}
                placeholder="Escriba lo ocurrido..."
                placeholderTextColor="#666"
                multiline={true}
                value={reportDescription}
                onChangeText={setReportDescription}
              />
            </View>

            <TouchableOpacity 
              style={[styles.botonHubMenu, { marginBottom: 15, justifyContent: 'center' }]} 
              onPress={tomarOSeleccionarFoto}
            >
              <Text style={{ fontSize: 18, marginRight: 8 }}>📷</Text>
              <Text style={{ color: '#38bdf8', fontWeight: 'bold' }}>
                {reportImageUri ? 'Cambiar fotografía' : 'Tomar foto o subir desde galería'}
              </Text>
            </TouchableOpacity>

            {reportImageUri && (
              <Image source={{ uri: reportImageUri }} style={styles.imagenPreviaReporte} />
            )}

            <TouchableOpacity 
              style={[styles.botonVerde, { backgroundColor: '#d97706', height: 48, borderRadius: 12, marginTop: 10 }]} 
              onPress={enviarReporteIncidencia}
              disabled={isSubmittingReport}
            >
              {isSubmittingReport ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.textoBotonVerde}>ENVIAR REPORTE</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.botonVolver, { marginTop: 12, height: 44, borderRadius: 12 }]} 
              onPress={() => setPantallaActual('hub')}
            >
              <Text style={styles.textoBotonVolver}>Cancelar / Volver</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 💬 PANTALLA 5: CHAT DE TEXTO
  if (pantallaActual === 'chat') {
    const renderItemMensaje = ({ item }) => {
      const esMio = item.emisor === nombreUsuarioCompleto;
      return (
        <View style={[styles.contenedorBurbuja, esMio ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
          <View style={[styles.burbujaChat, esMio ? styles.burbujaMia : styles.burbujaAjena]}>
            {!esMio && <Text style={styles.textoEmisorChat}>{item.emisor}</Text>}
            <Text style={styles.textoMensajeChat}>{item.texto}</Text>
            <Text style={styles.textoHoraChat}>{item.timestamp}</Text>
          </View>
        </View>
      );
    };

    const totalUsuariosActivos = connectedUsers.length + 1;

    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1, width: '100%' }}
        >
          <View style={styles.headerDisplay}>
            <View style={styles.headerFilaSuperior}>
              <Text style={styles.brandText}>Colectivos La Punta Chat • {canalActivo}</Text>
              <TouchableOpacity onPress={salirDelCanal} style={styles.areaEngranaje}>
                <Text style={styles.textoEngranaje}>🏠</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.choferTag}>Usuario: {nombreUsuarioCompleto}</Text>

            {/* 🟢 PANEL DE PRESENCIA REAL */}
            <TouchableOpacity 
              style={styles.barraPresencia} 
              onPress={() => setShowUsersPanel(!showUsersPanel)}
            >
              <Text style={styles.textoPresencia}>
                🟢 {totalUsuariosActivos} {totalUsuariosActivos === 1 ? 'Usuario activo' : 'Usuarios activos'} en la frecuencia
              </Text>
              <Text style={{ color: '#888', fontSize: 11 }}>{showUsersPanel ? '▲ Ocultar' : '▼ Ver quiénes'}</Text>
            </TouchableOpacity>

            {showUsersPanel && (
              <View style={styles.dropdownPresencia}>
                <Text style={styles.itemUsuarioPresencia}>🛡️ {nombreUsuarioCompleto} (Tú)</Text>
                {connectedUsers.map((u, idx) => (
                  <Text key={u.id || idx} style={styles.itemUsuarioPresencia}>
                    🛡️ {u.nombre || u.name}
                  </Text>
                ))}
              </View>
            )}
          </View>

          <FlatList
            ref={flatListRef}
            data={mensajes}
            keyExtractor={(item) => item.id}
            renderItem={renderItemMensaje}
            style={styles.listaChatContainer}
            contentContainerStyle={{ paddingVertical: 5 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />

          <View style={styles.contenedorInputChat}>
            <TextInput
              style={styles.inputMensajeChat}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#888"
              value={textoMensaje}
              onChangeText={setTextoMensaje}
              maxLength={100}
            />
            <TouchableOpacity style={styles.botonEnviarChat} onPress={enviarMensajeTexto}>
              <Text style={{ fontSize: 18 }}>➡️</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={[styles.botonHubMenu, { width: '100%', height: 46, borderRadius: 12, marginBottom: 10 }]} 
            onPress={() => setPantallaActual('walkie')}
          >
            <Text style={{ fontSize: 14, color: '#ffffff', fontWeight: 'bold' }}>🎙️ Cambiar a Radio de este Canal</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ⚙️ PANTALLA 6: CONFIGURACIÓN
  if (pantallaActual === 'configuracion') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.tarjetaCentrada}>
          <Text style={styles.tituloConfig}>Configuración ⚙️</Text>
          
          <View style={styles.seccionInfoEdicion}>
            <Text style={styles.textoInfoLabel}>Identificación del Operador</Text>
            {isEditing ? (
              <TextInput
                style={styles.entradaTextoEdicion}
                value={nuevoNombre}
                onChangeText={setNuevoNombre}
                maxLength={25}
                placeholder="Nuevo nombre..."
                placeholderTextColor="#888"
              />
            ) : (
              <Text style={styles.textoInfoValorNombre}>
                {nombreUsuarioCompleto}
              </Text>
            )}
            
            <TouchableOpacity 
              style={[styles.botonVerde, { height: 40, borderRadius: 10, marginTop: 5 }]}
              onPress={isEditing ? guardarNuevoNombre : () => setIsEditing(true)}
            >
              <Text style={styles.textoBotonVerde}>
                {isEditing ? 'Guardar Cambios' : 'Editar Nombre / Cargo'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.seccionInfo}>
            <Text style={styles.textoInfoLabel}>Versión del Sistema</Text>
            <Text style={styles.textoInfoValor}>Colectivos La Punta v1.0</Text>
          </View>

          <View style={styles.seccionInfo}>
            <Text style={styles.textoInfoLabel}>Estado del Servidor</Text>
            <Text style={styles.textoInfoValorCed}>🟢 Operativo (Cloud)</Text>
          </View>

          <TouchableOpacity 
            style={[styles.botonVolver, { marginTop: 30 }]} 
            onPress={() => {
              setIsEditing(false);
              setPantallaActual('hub');
            }}
          >
            <Text style={styles.textoBotonVolver}>Volver al Menú Principal</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 📻 PANTALLA 7: RADIO WALKIE-TALKIE
  if (pantallaActual === 'walkie') {
    const totalUsuariosActivos = connectedUsers.length + 1;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerDisplay}>
          <View style={styles.headerFilaSuperior}>
            <Text style={styles.brandText}>Colectivos La Punta • {canalActivo}</Text>
            <TouchableOpacity onPress={salirDelCanal} style={styles.areaEngranaje}>
              <Text style={styles.textoEngranaje}>🏠</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.choferTag}>Usuario: {nombreUsuarioCompleto}</Text>

          {/* 🟢 PANEL DE PRESENCIA REAL */}
          <TouchableOpacity 
            style={styles.barraPresencia} 
            onPress={() => setShowUsersPanel(!showUsersPanel)}
          >
            <Text style={styles.textoPresencia}>
              🟢 {totalUsuariosActivos} {totalUsuariosActivos === 1 ? 'Usuario activo' : 'Usuarios activos'} en la frecuencia
            </Text>
            <Text style={{ color: '#888', fontSize: 11 }}>{showUsersPanel ? '▲ Ocultar' : '▼ Ver quiénes'}</Text>
          </TouchableOpacity>

          {showUsersPanel && (
            <View style={styles.dropdownPresencia}>
              <Text style={styles.itemUsuarioPresencia}>🛡️ {nombreUsuarioCompleto} (Tú)</Text>
              {connectedUsers.map((u, idx) => (
                <Text key={u.id || idx} style={styles.itemUsuarioPresencia}>
                  🛡️ {u.nombre || u.name}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.signalContainer}>
            <View style={[styles.signalDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.estado, { color: statusColor }]}>
              {emisorActual ? `🔊 DE: ${emisorActual}` : statusText}
            </Text>
          </View>
        </View>

        <View style={styles.centerSpace}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPressIn={iniciarTransmision}
            onPressOut={finalizarTransmision}
            style={[
              styles.btnHablar,
              isButtonActive ? styles.btnActive : styles.btnInactive,
              statusText.includes('ESCUCHANDO') && styles.btnListening
            ]}
          >
            <Text style={styles.btnText}>PTT</Text>
            <Text style={styles.subTexto}>{subText}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.botonHubMenu, { width: '100%', height: 46, borderRadius: 12, marginBottom: 10 }]} 
          onPress={() => setPantallaActual('chat')}
        >
          <Text style={{ fontSize: 14, color: '#ffffff', fontWeight: 'bold' }}>💬 Cambiar a Chat de este Canal</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Mantén presionado para hablar • Colectivos La Punta</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 🚀 PANTALLA DE CARGA / SPLASH (5 SEGUNDOS)
  return (
    <View style={[styles.container, styles.centradoTotal]}>
      <Image
        source={require("./assets/splash.png")}
        style={{
          width: "82%",
          height: 330,
          resizeMode: "contain",
          marginBottom: 12
        }}
      />

      <ActivityIndicator
        size="small"
        color="#d4af37"
        style={{ marginBottom: 14 }}
      />

      <Text style={{
        color: "#8d939d",
        fontSize: 11,
        fontWeight: "600",
        letterSpacing: 1.5
      }}>
        CONECTANDO CON CENTRAL
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#11141a',
    alignItems: 'center',
    justifyContent: 'flex-start', 
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: Platform.OS === 'android' ? 30 : 20, 
    paddingHorizontal: 20,
  },
  centradoTotal: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* ===== HUB PRINCIPAL ===== */
  hubScreen: {
    flex: 1,
    backgroundColor: "#11141a",
    paddingTop: Platform.OS === "ios" ? 48 : 34,
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  hubHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hubEyebrow: {
    color: "#7f8794",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.2,
    marginBottom: 5,
  },
  hubBrand: {
    color: "#FACC15",
    fontSize: 22,
    fontWeight: "900",
  },
  hubEstado: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161b1b",
    borderWidth: 1,
    borderColor: "#26352d",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  hubEstadoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#2ed573",
    marginRight: 6,
  },
  hubEstadoTexto: {
    color: "#2ed573",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  hubDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#252a31",
    marginTop: 20,
  },
  hubIntro: {
    width: "100%",
    marginTop: 27,
    marginBottom: 22,
  },
  hubSaludo: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 6,
  },
  hubDescripcion: {
    color: "#858d99",
    fontSize: 13,
  },
  hubActions: {
    width: "100%",
  },
  hubAction: {
    width: "100%",
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 18,
    paddingHorizontal: 17,
    paddingVertical: 17,
    marginBottom: 14,
  },
  hubActionPrincipal: {
    borderColor: "#5a511e",
    backgroundColor: "#1b1b18",
  },
  hubActionReporte: {
    borderColor: "#49341d",
  },
  hubIconBox: {
    width: 55,
    height: 55,
    borderRadius: 16,
    backgroundColor: "#22262d",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  hubIconBoxReporte: {
    backgroundColor: "#292117",
  },
  hubIcon: {
    fontSize: 27,
  },
  hubActionText: {
    flex: 1,
  },
  hubActionLabel: {
    color: "#FACC15",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.7,
    marginBottom: 4,
  },
  hubActionTitle: {
    color: "#f5f6f7",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  hubActionDescription: {
    color: "#858d99",
    fontSize: 12,
    lineHeight: 17,
  },
  hubArrow: {
    color: "#69717d",
    fontSize: 32,
    fontWeight: "300",
    marginLeft: 8,
  },
  hubFooter: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 18,
  },
  hubSettings: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  hubSettingsIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  hubSettingsText: {
    color: "#9ba2ad",
    fontSize: 13,
    fontWeight: "600",
  },
  hubVersion: {
    color: "#414751",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.7,
    marginTop: 8,
  },

  tarjetaCentrada: {
    width: "100%",
    backgroundColor: "#16181a",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FACC15",
    shadowColor: "#FACC15",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  headerDisplay: {
    width: "100%",
    backgroundColor: "#16181a",
    borderRadius: 16,
    padding: 15,
    borderWidth: 2,
    borderColor: "#FACC15",
    alignItems: 'center',
  },
  headerFilaSuperior: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  areaEngranaje: {
    padding: 4,
  },
  textoEngranaje: {
    fontSize: 20,
  },
  choferTag: {
    color: "#FACC15",
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 5,
  },
  brandText: {
    color: '#57606f',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  brandTitleText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FACC15",
    marginBottom: 5,
    letterSpacing: 1,
  },
  barraPresencia: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#141821',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#262c3a',
  },
  textoPresencia: {
    color: '#2ed573',
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownPresencia: {
    width: '100%',
    backgroundColor: '#141821',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#262c3a',
  },
  itemUsuarioPresencia: {
    color: '#cbd5e1',
    fontSize: 12,
    paddingVertical: 3,
  },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  signalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  estado: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  centerSpace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  btnHablar: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnInactive: {
    borderColor: '#2ed573',
    backgroundColor: '#1e2432',
  },
  btnActive: {
    borderColor: '#ff6b81',
    backgroundColor: '#ff4757',
    transform: [{ scale: 0.95 }],
  },
  btnListening: {
    borderColor: '#eccc68',
    backgroundColor: '#222f3e',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },
  subTexto: {
    fontSize: 10,
    color: '#a4b0be',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 5,
    textAlign: 'center',
  },
  footer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },
  footerText: {
    color: '#57606f',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  tituloBienvenida: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtituloBienvenida: {
    fontSize: 13,
    color: '#a4b0be',
    textAlign: 'center',
    marginBottom: 20,
  },
  tituloConfig: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
  },
  seccionInfo: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d3446',
  },
  seccionInfoEdicion: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d3446',
  },
  textoInfoLabel: {
    fontSize: 14,
    color: '#a4b0be',
  },
  textoInfoValor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  textoInfoValorNombre: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FACC15",
    marginTop: 5,
    marginBottom: 10,
  },
  textoInfoValorCed: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2ed573',
  },
  entradaTexto: {
    width: '100%',
    height: 48,
    backgroundColor: '#1e2432',
    borderRadius: 24,
    paddingHorizontal: 20,
    fontSize: 15,
    color: '#ffffff',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#2d3446',
  },
  inputDisabled: {
    width: '100%',
    height: 44,
    backgroundColor: '#141821',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 14,
    color: '#888',
    borderWidth: 1,
    borderColor: '#262c3a',
  },
  entradaTextoEdicion: {
    width: '100%',
    height: 45,
    backgroundColor: '#1e2432',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 15,
    color: '#ffffff',
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2ed573',
  },
  botonHubMenu: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16181a",
    borderWidth: 1,
    borderColor: "#2a2e33",
    borderLeftWidth: 6,
    borderLeftColor: "#FACC15",
    borderRadius: 14,
    padding: 14,
    justifyContent: "flex-start",
  },
  iconoHubMenu: {
    fontSize: 26,
    marginRight: 12,
  },
  contenedorTextoHub: {
    flex: 1,
    alignItems: 'flex-start',
  },
  tituloBotonHub: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#FACC15",
  },
  descripcionBotonHub: {
    fontSize: 12,
    color: '#a4b0be',
    marginTop: 2,
  },
  botonCanalItem: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e2432',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d3446',
  },
  textoBotonCanalItem: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  textoFlechaCanal: {
    color: '#2ed573',
    fontSize: 14,
  },
  botonVerde: {
    backgroundColor: "#FACC15",
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    height: 48,
  },
  textoBotonVerde: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#000000",
    fontSize: 15,
    fontWeight: 'bold',
  },
  botonVolver: {
    width: "100%",
    paddingVertical: 14,
    backgroundColor: "#1c1e22",
    borderWidth: 1,
    borderColor: "#2e343d",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  textoBotonVolver: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  imagenPreviaReporte: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  listaChatContainer: {
    flex: 1,
    width: '100%',
    marginVertical: 10,
  },
  contenedorBurbuja: {
    width: '100%',
    paddingHorizontal: 5,
    marginVertical: 4, 
  },
  burbujaChat: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  burbujaMia: {
    backgroundColor: '#2d3446', 
    borderBottomRightRadius: 2,
    borderWidth: 1,
    borderColor: '#3a445a',
  },
  burbujaAjena: {
    backgroundColor: '#1c2029',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#2d3446',
  },
  textoEmisorChat: {
    color: '#2ed573',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  textoMensajeChat: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 20,
  },
  textoHoraChat: {
    color: '#a4b0be',
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
    opacity: 0.8,
  },
  contenedorInputChat: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e2432',
    borderRadius: 25,
    paddingHorizontal: 5,
    height: 50,
    borderWidth: 1,
    borderColor: '#2d3446',
    marginTop: 5,
    marginBottom: 15, 
  },
  inputMensajeChat: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 15,
    color: '#ffffff',
    fontSize: 15,
  },
  botonEnviarChat: {
    width: 40,
    height: 40,
    backgroundColor: '#2d3446',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 5,
  }
});