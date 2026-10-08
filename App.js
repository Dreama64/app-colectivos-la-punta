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
import ColectivosBackground from './modules/colectivos-background';

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
  const [temaApp, setTemaApp] = useState('oscuro');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [emisorActual, setEmisorActual] = useState('');

  const [statusText, setStatusText] = useState('CENTRAL EN LÍNEA');
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
    cargarTemaApp();

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

  const cargarTemaApp = async () => {
    try {
      const temaGuardado = await AsyncStorage.getItem('tema_app');
      if (temaGuardado === 'claro' || temaGuardado === 'oscuro') {
        setTemaApp(temaGuardado);
      }
    } catch (error) {
      console.log('Error al cargar tema:', error);
    }
  };

  const cambiarTemaApp = async (nuevoTema) => {
    try {
      setTemaApp(nuevoTema);
      await AsyncStorage.setItem('tema_app', nuevoTema);
    } catch (error) {
      console.log('Error al guardar tema:', error);
    }
  };

  const iniciarServicioBackground = () => {
    try {
      ColectivosBackground.start();
      console.log("Servicio background iniciado");
    } catch (error) {
      console.log("Error al iniciar servicio background:", error);
    }
  };

  const comprobarUsuario = async () => {
    try {
      const usuarioGuardado = await AsyncStorage.getItem('nombre_chofer');
      if (usuarioGuardado) {
        const nombreLimpio = usuarioGuardado.split(' #')[0];
        setNombreUsuarioCompleto(nombreLimpio);
        setNuevoNombre(nombreLimpio);
        iniciarServicioBackground();
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
      iniciarServicioBackground();
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
      actualizarUI('CENTRAL EN LÍNEA', '#2ed573', 'PULSA PARA HABLAR');
      
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
            actualizarUI('CENTRAL EN LÍNEA', '#2ed573', 'PULSA PARA HABLAR');
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

      actualizarUI('CENTRAL EN LÍNEA', '#2ed573', 'PULSA PARA HABLAR');
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
  // 📝 PANTALLA 1: REGISTRO
  if (pantallaActual === 'registro') {
    return (
      <SafeAreaView style={styles.registroScreen}>
        <View style={styles.registroHeader}>
          <Text style={styles.registroEyebrow}>COLECTIVOS LA PUNTA</Text>
          <View style={styles.registroLinea} />
        </View>

        <View style={styles.registroContenido}>
          <Image
            source={require("./assets/splash.png")}
            style={styles.registroLogo}
          />

          <Text style={styles.registroLabel}>PRIMER ACCESO</Text>
          <Text style={styles.registroTitulo}>Identifica al operador</Text>
          <Text style={styles.registroDescripcion}>
            Ingresa tu nombre o identificación para acceder al sistema de terreno.
          </Text>

          <Text style={styles.registroInputLabel}>NOMBRE / IDENTIFICACIÓN</Text>
          <TextInput
            style={styles.registroInput}
            placeholder="Ej. Juan Pérez"
            placeholderTextColor="#656d78"
            value={nombreIngresado}
            onChangeText={setNombreIngresado}
            maxLength={25}
          />

          <TouchableOpacity
            style={styles.registroBoton}
            activeOpacity={0.8}
            onPress={manejarRegistro}
          >
            <Text style={styles.registroBotonTexto}>INGRESAR AL SISTEMA</Text>
            <Text style={styles.registroBotonFlecha}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.registroFooter}>
          <View style={styles.registroEstadoDot} />
          <Text style={styles.registroFooterTexto}>SISTEMA DE TERRENO · LA PUNTA</Text>
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
    const esRadio = modoComunicacion === 'radio';

    return (
      <SafeAreaView style={styles.selectorScreen}>
        <View style={styles.selectorHeader}>
          <View>
            <Text style={styles.selectorEyebrow}>COLECTIVOS LA PUNTA</Text>
            <Text style={styles.selectorBrand}>Central Operativa</Text>
          </View>
          <View style={[
            styles.selectorModoBadge,
            esRadio ? styles.selectorModoRadio : styles.selectorModoChat
          ]}>
            <View style={[
              styles.selectorModoDot,
              esRadio ? styles.selectorModoDotRadio : styles.selectorModoDotChat
            ]} />
            <Text style={styles.selectorModoTexto}>
              {esRadio ? 'RADIO PTT' : 'CHAT'}
            </Text>
          </View>
        </View>

        <View style={styles.selectorDivider} />

        <View style={styles.selectorIntro}>
          <Text style={styles.selectorLabel}>COMUNICACIONES</Text>
          <Text style={styles.selectorTitulo}>Selecciona un canal</Text>
          <Text style={styles.selectorDescripcion}>
            Elige la frecuencia de trabajo para continuar.
          </Text>
        </View>

        <View style={styles.selectorLista}>
          {CANALES_PREDEFINIDOS.map((canal, index) => (
            <TouchableOpacity
              key={index}
              style={styles.selectorCanal}
              activeOpacity={0.8}
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
              <View style={styles.selectorCanalNumero}>
                <Text style={styles.selectorCanalNumeroTexto}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
              </View>
              <View style={styles.selectorCanalInfo}>
                <Text style={styles.selectorCanalNombre}>{canal}</Text>
                <Text style={styles.selectorCanalEstado}>DISPONIBLE</Text>
              </View>
              <Text style={styles.selectorCanalFlecha}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.selectorFooter}>
          <TouchableOpacity
            style={styles.selectorVolver}
            activeOpacity={0.7}
            onPress={() => setPantallaActual('hub')}
          >
            <Text style={styles.selectorVolverFlecha}>‹</Text>
            <Text style={styles.selectorVolverTexto}>Volver al panel</Text>
          </TouchableOpacity>
          <Text style={styles.selectorFooterTexto}>LA PUNTA · SISTEMA DE TERRENO</Text>
        </View>
      </SafeAreaView>
    );
  }


  // 🚨 PANTALLA 4: GENERAR REPORTE
  if (pantallaActual === 'reportes') {
    const fechaHoraActual = new Date().toLocaleString('es-CL');

    return (
      <SafeAreaView style={styles.reporteScreen}>
        <ScrollView
          style={styles.reporteScroll}
          contentContainerStyle={styles.reporteScrollContenido}
          showsVerticalScrollIndicator={false}>

          <View style={styles.reporteHeader}>
            <View>
              <Text style={styles.reporteEyebrow}>COLECTIVOS LA PUNTA</Text>
              <Text style={styles.reporteBrand}>Registro de novedades</Text>
            </View>

            <TouchableOpacity
              style={styles.reporteSalir}
              activeOpacity={0.7}
              onPress={() => setPantallaActual('hub')}>
              <Text style={styles.reporteSalirTexto}>SALIR</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reporteDivider} />

          <View style={styles.reporteIntro}>
            <View style={styles.reporteTipoBadge}>
              <View style={styles.reporteTipoDot} />
              <Text style={styles.reporteTipoTexto}>INCIDENCIA</Text>
            </View>
            <Text style={styles.reporteTitulo}>Nuevo reporte</Text>
            <Text style={styles.reporteDescripcion}>
              Registra una novedad de terreno y adjunta evidencia si corresponde.
            </Text>
          </View>

          <View style={styles.reporteMetaCard}>
            <View style={styles.reporteMetaFila}>
              <View style={styles.reporteMetaBloque}>
                <Text style={styles.reporteMetaLabel}>OPERADOR</Text>
                <Text style={styles.reporteMetaValor}>{nombreUsuarioCompleto}</Text>
              </View>
            </View>
            <View style={styles.reporteMetaSeparador} />
            <View style={styles.reporteMetaBloque}>
              <Text style={styles.reporteMetaLabel}>FECHA Y HORA</Text>
              <Text style={styles.reporteMetaValor}>{fechaHoraActual}</Text>
            </View>
          </View>

          <View style={styles.reporteFormulario}>
            <Text style={styles.reporteCampoLabel}>DETALLE DE LA INCIDENCIA</Text>
            <TextInput
              style={styles.reporteInputDetalle}
              placeholder="Describe brevemente lo ocurrido..."
              placeholderTextColor="#656d78"
              multiline={true}
              textAlignVertical="top"
              value={reportDescription}
              onChangeText={setReportDescription}
            />

            <Text style={styles.reporteCampoLabel}>EVIDENCIA FOTOGRÁFICA</Text>
            <TouchableOpacity
              style={styles.reporteFotoBoton}
              activeOpacity={0.8}
              onPress={tomarOSeleccionarFoto}>
              <View style={styles.reporteFotoMarca}>
                <Text style={styles.reporteFotoMarcaTexto}>+</Text>
              </View>
              <View style={styles.reporteFotoInfo}>
                <Text style={styles.reporteFotoTitulo}>
                  {reportImageUri ? 'Cambiar fotografía' : 'Agregar fotografía'}
                </Text>
                <Text style={styles.reporteFotoSubtitulo}>
                  {reportImageUri ? 'Evidencia adjunta al reporte' : 'Cámara o galería del dispositivo'}
                </Text>
              </View>
              <Text style={styles.reporteFotoFlecha}>›</Text>
            </TouchableOpacity>

            {reportImageUri && (
              <View style={styles.reportePreviewContenedor}>
                <Image source={{ uri: reportImageUri }} style={styles.imagenPreviaReporte} />
                <View style={styles.reporteAdjuntoBadge}>
                  <View style={styles.reporteAdjuntoDot} />
                  <Text style={styles.reporteAdjuntoTexto}>EVIDENCIA ADJUNTA</Text>
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.reporteEnviar, isSubmittingReport && styles.reporteEnviarDeshabilitado]}
            activeOpacity={0.8}
            onPress={enviarReporteIncidencia}
            disabled={isSubmittingReport}>
            {isSubmittingReport ? (
              <ActivityIndicator color="#11141a" />
            ) : (
              <>
                <Text style={styles.reporteEnviarTexto}>REGISTRAR REPORTE</Text>
                <Text style={styles.reporteEnviarFlecha}>›</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reporteCancelar}
            activeOpacity={0.7}
            onPress={() => setPantallaActual('hub')}>
            <Text style={styles.reporteCancelarTexto}>Cancelar y volver al panel</Text>
          </TouchableOpacity>

          <Text style={styles.reporteFooter}>LA PUNTA · REGISTRO DE TERRENO</Text>
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
      <SafeAreaView style={styles.chatScreen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatKeyboard}>

          <View style={styles.chatHeader}>
            <View>
              <Text style={styles.chatEyebrow}>COLECTIVOS LA PUNTA</Text>
              <Text style={styles.chatBrand}>{canalActivo}</Text>
            </View>

            <TouchableOpacity
              style={styles.chatSalir}
              activeOpacity={0.7}
              onPress={salirDelCanal}>
              <Text style={styles.chatSalirTexto}>SALIR</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chatDivider} />

          <View style={styles.chatMeta}>
            <View>
              <Text style={styles.chatModoLabel}>CHAT DE CANAL</Text>
              <Text style={styles.chatOperador}>Operador · {nombreUsuarioCompleto}</Text>
            </View>
            <View style={styles.chatOnlineBadge}>
              <View style={styles.chatOnlineDot} />
              <Text style={styles.chatOnlineTexto}>EN LÍNEA</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.chatPresencia}
            activeOpacity={0.8}
            onPress={() => setShowUsersPanel(!showUsersPanel)}>
            <View style={styles.chatPresenciaIzquierda}>
              <View style={styles.chatPresenciaDot} />
              <View>
                <Text style={styles.chatPresenciaTitulo}>
                  {totalUsuariosActivos} {totalUsuariosActivos === 1 ? 'usuario activo' : 'usuarios activos'}
                </Text>
                <Text style={styles.chatPresenciaSubtitulo}>EN ESTE CANAL</Text>
              </View>
            </View>
            <Text style={styles.chatPresenciaAccion}>
              {showUsersPanel ? 'OCULTAR  ▲' : 'VER LISTA  ▼'}
            </Text>
          </TouchableOpacity>

          {showUsersPanel && (
            <View style={styles.chatUsuariosPanel}>
              <View style={styles.chatUsuarioFila}>
                <View style={styles.chatUsuarioDot} />
                <Text style={styles.chatUsuarioNombre}>{nombreUsuarioCompleto}</Text>
                <Text style={styles.chatUsuarioTu}>TÚ</Text>
              </View>
              {connectedUsers.map((u, idx) => (
                <View key={u.id || idx} style={styles.chatUsuarioFila}>
                  <View style={styles.chatUsuarioDot} />
                  <Text style={styles.chatUsuarioNombre}>{u.nombre || u.name}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.chatConversacion}>
            {mensajes.length === 0 && (
              <View style={styles.chatVacio}>
                <Text style={styles.chatVacioTitulo}>SIN MENSAJES</Text>
                <Text style={styles.chatVacioTexto}>Inicia una conversación en {canalActivo}</Text>
              </View>
            )}

            <FlatList
              ref={flatListRef}
              data={mensajes}
              keyExtractor={(item) => item.id}
              renderItem={renderItemMensaje}
              style={styles.listaChatContainer}
              contentContainerStyle={styles.chatListaContenido}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />
          </View>

          <View style={styles.chatInputFila}>
            <TextInput
              style={styles.chatInput}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#656d78"
              value={textoMensaje}
              onChangeText={setTextoMensaje}
              maxLength={100}
              returnKeyType="send"
              onSubmitEditing={enviarMensajeTexto}
            />
            <TouchableOpacity
              style={styles.chatEnviar}
              activeOpacity={0.8}
              onPress={enviarMensajeTexto}>
              <Text style={styles.chatEnviarTexto}>›</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.chatCambiarModo}
            activeOpacity={0.8}
            onPress={() => setPantallaActual('walkie')}>
            <View>
              <Text style={styles.chatCambiarLabel}>CAMBIAR MODO</Text>
              <Text style={styles.chatCambiarTitulo}>Radio PTT de este canal</Text>
            </View>
            <Text style={styles.chatCambiarFlecha}>›</Text>
          </TouchableOpacity>

          <Text style={styles.chatFooterTexto}>LA PUNTA · COMUNICACIONES DE TERRENO</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ⚙️ PANTALLA 6: CONFIGURACIÓN
  if (pantallaActual === 'configuracion') {
    return (
      <SafeAreaView style={styles.configScreen}>
        <ScrollView
          style={styles.configScroll}
          contentContainerStyle={styles.configScrollContenido}
          showsVerticalScrollIndicator={false}>

          <View style={styles.configHeader}>
            <View>
              <Text style={styles.configEyebrow}>COLECTIVOS LA PUNTA</Text>
              <Text style={styles.configBrand}>Configuración</Text>
            </View>

            <TouchableOpacity
              style={styles.configSalir}
              activeOpacity={0.7}
              onPress={() => {
                setIsEditing(false);
                setPantallaActual('hub');
              }}>
              <Text style={styles.configSalirTexto}>SALIR</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.configDivider} />

          <View style={styles.configIntro}>
            <Text style={styles.configTitulo}>Preferencias del sistema</Text>
            <Text style={styles.configDescripcion}>
              Administra tu identificación y la apariencia de la aplicación.
            </Text>
          </View>

          <Text style={styles.configSeccionLabel}>OPERADOR</Text>
          <View style={styles.configCard}>
            <Text style={styles.configCampoLabel}>IDENTIFICACIÓN</Text>

            {isEditing ? (
              <TextInput
                style={styles.configNombreInput}
                value={nuevoNombre}
                onChangeText={setNuevoNombre}
                maxLength={25}
                placeholder="Nuevo nombre o cargo..."
                placeholderTextColor="#656d78"
              />
            ) : (
              <Text style={styles.configNombre}>{nombreUsuarioCompleto}</Text>
            )}

            <TouchableOpacity
              style={styles.configEditarBoton}
              activeOpacity={0.8}
              onPress={isEditing ? guardarNuevoNombre : () => setIsEditing(true)}>
              <Text style={styles.configEditarTexto}>
                {isEditing ? 'GUARDAR CAMBIOS' : 'EDITAR NOMBRE / CARGO'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.configSeccionLabel}>APARIENCIA</Text>
          <View style={styles.configCard}>
            <View style={styles.configTemaCabecera}>
              <View>
                <Text style={styles.configTemaTitulo}>Tema de la interfaz</Text>
                <Text style={styles.configTemaSubtitulo}>Selecciona la apariencia del sistema</Text>
              </View>
            </View>

            <View style={styles.configTemaSelector}>
              <TouchableOpacity
                style={[
                  styles.configTemaOpcion,
                  temaApp === 'oscuro' && styles.configTemaOpcionActiva
                ]}
                activeOpacity={0.8}
                onPress={() => cambiarTemaApp('oscuro')}>
                <View style={[
                  styles.configTemaIndicador,
                  temaApp === 'oscuro' && styles.configTemaIndicadorActivo
                ]} />
                <Text style={[
                  styles.configTemaTexto,
                  temaApp === 'oscuro' && styles.configTemaTextoActivo
                ]}>OSCURO</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.configTemaOpcion,
                  temaApp === 'claro' && styles.configTemaOpcionActiva
                ]}
                activeOpacity={0.8}
                onPress={() => cambiarTemaApp('claro')}>
                <View style={[
                  styles.configTemaIndicador,
                  temaApp === 'claro' && styles.configTemaIndicadorActivo
                ]} />
                <Text style={[
                  styles.configTemaTexto,
                  temaApp === 'claro' && styles.configTemaTextoActivo
                ]}>CLARO</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.configSeccionLabel}>SISTEMA</Text>
          <View style={styles.configSistemaCard}>
            <View style={styles.configSistemaFila}>
              <View>
                <Text style={styles.configSistemaLabel}>VERSIÓN</Text>
                <Text style={styles.configSistemaValor}>Colectivos La Punta v1.0</Text>
              </View>
            </View>

            <View style={styles.configSistemaSeparador} />

            <View style={styles.configSistemaFila}>
              <View>
                <Text style={styles.configSistemaLabel}>SERVIDOR</Text>
                <Text style={styles.configSistemaValor}>Operativo · Cloud</Text>
              </View>
              <View style={styles.configOnlineBadge}>
                <View style={styles.configOnlineDot} />
                <Text style={styles.configOnlineTexto}>EN LÍNEA</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.configVolver}
            activeOpacity={0.8}
            onPress={() => {
              setIsEditing(false);
              setPantallaActual('hub');
            }}>
            <Text style={styles.configVolverTexto}>VOLVER AL PANEL PRINCIPAL</Text>
          </TouchableOpacity>

          <Text style={styles.configFooter}>LA PUNTA · SISTEMA DE TERRENO</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }


  // 📻 PANTALLA 7: RADIO WALKIE-TALKIE
  if (pantallaActual === 'walkie') {
    const totalUsuariosActivos = connectedUsers.length + 1;

    return (
      <SafeAreaView style={styles.radioScreen}>
        <View style={styles.radioHeader}>
          <View>
            <Text style={styles.radioEyebrow}>COLECTIVOS LA PUNTA</Text>
            <Text style={styles.radioBrand}>{canalActivo}</Text>
          </View>

          <TouchableOpacity
            style={styles.radioHome}
            activeOpacity={0.7}
            onPress={salirDelCanal}
          >
            <Text style={styles.radioHomeTexto}>SALIR</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.radioDivider} />

        <View style={styles.radioMeta}>
          <View>
            <Text style={styles.radioModoLabel}>RADIO PTT</Text>
            <Text style={styles.radioOperador}>Operador · {nombreUsuarioCompleto}</Text>
          </View>
          <View style={styles.radioOnlineBadge}>
            <View style={styles.radioOnlineDot} />
            <Text style={styles.radioOnlineTexto}>EN LÍNEA</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.radioPresencia}
          activeOpacity={0.8}
          onPress={() => setShowUsersPanel(!showUsersPanel)}
        >
          <View style={styles.radioPresenciaIzquierda}>
            <View style={styles.radioPresenciaDot} />
            <View>
              <Text style={styles.radioPresenciaTitulo}>
                {totalUsuariosActivos} {totalUsuariosActivos === 1 ? 'usuario activo' : 'usuarios activos'}
              </Text>
              <Text style={styles.radioPresenciaSubtitulo}>EN ESTA FRECUENCIA</Text>
            </View>
          </View>
          <Text style={styles.radioPresenciaAccion}>
            {showUsersPanel ? 'OCULTAR  ▲' : 'VER LISTA  ▼'}
          </Text>
        </TouchableOpacity>

        {showUsersPanel && (
          <View style={styles.radioUsuariosPanel}>
            <View style={styles.radioUsuarioFila}>
              <View style={styles.radioUsuarioDot} />
              <Text style={styles.radioUsuarioNombre}>{nombreUsuarioCompleto}</Text>
              <Text style={styles.radioUsuarioTu}>TÚ</Text>
            </View>
            {connectedUsers.map((u, idx) => (
              <View key={u.id || idx} style={styles.radioUsuarioFila}>
                <View style={styles.radioUsuarioDot} />
                <Text style={styles.radioUsuarioNombre}>{u.nombre || u.name}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.radioEstado}>
          <View style={[styles.radioEstadoDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.radioEstadoTexto, { color: statusColor }]}>
            {emisorActual ? `RECIBIENDO · ${emisorActual}` : statusText}
          </Text>
        </View>

        <View style={styles.radioPTTArea}>
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

          <Text style={styles.radioPTTHint}>MANTÉN PRESIONADO PARA TRANSMITIR</Text>
        </View>

        <TouchableOpacity
          style={styles.radioCambiarModo}
          activeOpacity={0.8}
          onPress={() => setPantallaActual('chat')}
        >
          <View>
            <Text style={styles.radioCambiarLabel}>CAMBIAR MODO</Text>
            <Text style={styles.radioCambiarTitulo}>Chat de este canal</Text>
          </View>
          <Text style={styles.radioCambiarFlecha}>›</Text>
        </TouchableOpacity>

        <Text style={styles.radioFooterTexto}>LA PUNTA · COMUNICACIONES DE TERRENO</Text>
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

  /* ===== REGISTRO / PRIMER ACCESO ===== */
  registroScreen: {
    flex: 1,
    backgroundColor: "#11141a",
    paddingTop: Platform.OS === "ios" ? 48 : 34,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  registroHeader: {
    width: "100%",
  },
  registroEyebrow: {
    color: "#7f8794",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.4,
  },
  registroLinea: {
    width: "100%",
    height: 1,
    backgroundColor: "#252a31",
    marginTop: 18,
  },
  registroContenido: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "flex-start",
    paddingBottom: 25,
  },
  registroLogo: {
    width: 105,
    height: 105,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 24,
  },
  registroLabel: {
    color: "#FACC15",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  registroTitulo: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 10,
  },
  registroDescripcion: {
    color: "#858d99",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 32,
    maxWidth: 330,
  },
  registroInputLabel: {
    color: "#9ba2ad",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 9,
  },
  registroInput: {
    width: "100%",
    height: 58,
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#303640",
    borderRadius: 14,
    paddingHorizontal: 17,
    color: "#ffffff",
    fontSize: 16,
    marginBottom: 16,
  },
  registroBoton: {
    width: "100%",
    height: 58,
    backgroundColor: "#FACC15",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  registroBotonTexto: {
    color: "#11141a",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
  registroBotonFlecha: {
    color: "#11141a",
    fontSize: 29,
    fontWeight: "400",
  },
  registroFooter: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 5,
  },
  registroEstadoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2ed573",
    marginRight: 8,
  },
  registroFooterTexto: {
    color: "#4d535d",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.6,
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
  /* ===== CONFIGURACIÓN ===== */
  configScreen: {
    flex: 1,
    backgroundColor: "#11141a",
    paddingTop: Platform.OS === "ios" ? 48 : 34,
  },
  configScroll: {
    flex: 1,
    width: "100%",
  },
  configScrollContenido: {
    paddingHorizontal: 22,
    paddingBottom: 34,
  },
  configHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  configEyebrow: {
    color: "#7f8794",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 5,
  },
  configBrand: {
    color: "#FACC15",
    fontSize: 22,
    fontWeight: "900",
  },
  configSalir: {
    borderWidth: 1,
    borderColor: "#343a43",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  configSalirTexto: {
    color: "#aab0b9",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  configDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#252a31",
    marginTop: 18,
  },
  configIntro: {
    width: "100%",
    marginTop: 25,
    marginBottom: 25,
  },
  configTitulo: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 7,
  },
  configDescripcion: {
    color: "#858d99",
    fontSize: 13,
    lineHeight: 19,
  },
  configSeccionLabel: {
    color: "#656d78",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 8,
    marginLeft: 2,
  },
  configCard: {
    width: "100%",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    padding: 15,
    marginBottom: 22,
  },
  configCampoLabel: {
    color: "#656d78",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginBottom: 7,
  },
  configNombre: {
    color: "#f1f2f4",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 13,
  },
  configNombreInput: {
    width: "100%",
    height: 48,
    backgroundColor: "#11141a",
    borderWidth: 1,
    borderColor: "#3a414b",
    borderRadius: 11,
    paddingHorizontal: 13,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 11,
  },
  configEditarBoton: {
    width: "100%",
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3b3f31",
    backgroundColor: "#1d1e18",
    borderRadius: 10,
  },
  configEditarTexto: {
    color: "#FACC15",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  configTemaCabecera: {
    width: "100%",
    marginBottom: 14,
  },
  configTemaTitulo: {
    color: "#f1f2f4",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  configTemaSubtitulo: {
    color: "#6f7782",
    fontSize: 10,
    fontWeight: "600",
  },
  configTemaSelector: {
    width: "100%",
    flexDirection: "row",
    backgroundColor: "#11141a",
    borderRadius: 11,
    padding: 4,
  },
  configTemaOpcion: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  configTemaOpcionActiva: {
    backgroundColor: "#292b24",
    borderWidth: 1,
    borderColor: "#4b4729",
  },
  configTemaIndicador: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#555d68",
    marginRight: 8,
  },
  configTemaIndicadorActivo: {
    backgroundColor: "#FACC15",
  },
  configTemaTexto: {
    color: "#6f7782",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  configTemaTextoActivo: {
    color: "#FACC15",
  },
  configSistemaCard: {
    width: "100%",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginBottom: 22,
  },
  configSistemaFila: {
    width: "100%",
    minHeight: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  configSistemaLabel: {
    color: "#656d78",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginBottom: 5,
  },
  configSistemaValor: {
    color: "#d9dce1",
    fontSize: 12,
    fontWeight: "700",
  },
  configSistemaSeparador: {
    width: "100%",
    height: 1,
    backgroundColor: "#292e36",
    marginVertical: 8,
  },
  configOnlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161b1b",
    borderWidth: 1,
    borderColor: "#26352d",
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  configOnlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2ed573",
    marginRight: 6,
  },
  configOnlineTexto: {
    color: "#2ed573",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  configVolver: {
    width: "100%",
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FACC15",
    borderRadius: 13,
  },
  configVolverTexto: {
    color: "#11141a",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  configFooter: {
    color: "#414751",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    textAlign: "center",
    marginTop: 18,
  },

  /* ===== REGISTRO DE NOVEDADES ===== */
  reporteScreen: {
    flex: 1,
    backgroundColor: "#11141a",
    paddingTop: Platform.OS === "ios" ? 48 : 34,
  },
  reporteScroll: {
    flex: 1,
    width: "100%",
  },
  reporteScrollContenido: {
    paddingHorizontal: 22,
    paddingBottom: 34,
  },
  reporteHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reporteEyebrow: {
    color: "#7f8794",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 5,
  },
  reporteBrand: {
    color: "#FACC15",
    fontSize: 21,
    fontWeight: "900",
  },
  reporteSalir: {
    borderWidth: 1,
    borderColor: "#343a43",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reporteSalirTexto: {
    color: "#aab0b9",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  reporteDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#252a31",
    marginTop: 18,
  },
  reporteIntro: {
    width: "100%",
    marginTop: 24,
    marginBottom: 20,
  },
  reporteTipoBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#211b15",
    borderWidth: 1,
    borderColor: "#49331d",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 13,
  },
  reporteTipoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#f59e0b",
    marginRight: 7,
  },
  reporteTipoTexto: {
    color: "#f59e0b",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  reporteTitulo: {
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "800",
    marginBottom: 7,
  },
  reporteDescripcion: {
    color: "#858d99",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 340,
  },
  reporteMetaCard: {
    width: "100%",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginBottom: 22,
  },
  reporteMetaFila: {
    width: "100%",
  },
  reporteMetaBloque: {
    width: "100%",
  },
  reporteMetaLabel: {
    color: "#656d78",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 5,
  },
  reporteMetaValor: {
    color: "#d9dce1",
    fontSize: 12,
    fontWeight: "700",
  },
  reporteMetaSeparador: {
    width: "100%",
    height: 1,
    backgroundColor: "#292e36",
    marginVertical: 11,
  },

  reporteFormulario: {
    width: "100%",
  },
  reporteCampoLabel: {
    color: "#7f8794",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  reporteInputDetalle: {
    width: "100%",
    minHeight: 120,
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#303640",
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 14,
    color: "#f1f2f4",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
  },
  reporteFotoBoton: {
    width: "100%",
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#303640",
    borderRadius: 14,
    paddingHorizontal: 13,
    marginBottom: 12,
  },
  reporteFotoMarca: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#211b15",
    borderWidth: 1,
    borderColor: "#49331d",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  reporteFotoMarcaTexto: {
    color: "#f59e0b",
    fontSize: 24,
    fontWeight: "400",
    marginTop: -2,
  },
  reporteFotoInfo: {
    flex: 1,
  },
  reporteFotoTitulo: {
    color: "#f1f2f4",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 3,
  },
  reporteFotoSubtitulo: {
    color: "#69717d",
    fontSize: 10,
    fontWeight: "600",
  },
  reporteFotoFlecha: {
    color: "#69717d",
    fontSize: 28,
    fontWeight: "300",
    marginLeft: 8,
  },
  reportePreviewContenedor: {
    width: "100%",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    padding: 8,
    marginBottom: 16,
  },
  reporteAdjuntoBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingTop: 9,
    paddingBottom: 4,
  },
  reporteAdjuntoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2ed573",
    marginRight: 7,
  },
  reporteAdjuntoTexto: {
    color: "#2ed573",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  reporteEnviar: {
    width: "100%",
    height: 54,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    marginTop: 10,
  },
  reporteEnviarDeshabilitado: {
    opacity: 0.55,
  },
  reporteEnviarTexto: {
    color: "#11141a",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  reporteEnviarFlecha: {
    position: "absolute",
    right: 18,
    color: "#11141a",
    fontSize: 28,
    fontWeight: "400",
    marginTop: -2,
  },
  reporteCancelar: {
    width: "100%",
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 7,
  },
  reporteCancelarTexto: {
    color: "#858d99",
    fontSize: 11,
    fontWeight: "700",
  },
  reporteFooter: {
    color: "#414751",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    textAlign: "center",
    marginTop: 13,
  },

  /* ===== CHAT DE CANAL ===== */
  chatScreen: {
    flex: 1,
    backgroundColor: "#11141a",
    paddingTop: Platform.OS === "ios" ? 48 : 34,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  chatKeyboard: {
    flex: 1,
    width: "100%",
  },
  chatHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatEyebrow: {
    color: "#7f8794",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 5,
  },
  chatBrand: {
    color: "#FACC15",
    fontSize: 22,
    fontWeight: "900",
  },
  chatSalir: {
    borderWidth: 1,
    borderColor: "#343a43",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chatSalirTexto: {
    color: "#aab0b9",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  chatDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#252a31",
    marginTop: 18,
  },
  chatMeta: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 16,
  },
  chatModoLabel: {
    color: "#FACC15",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 5,
  },
  chatOperador: {
    color: "#8b929d",
    fontSize: 12,
    fontWeight: "600",
  },
  chatOnlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161b1b",
    borderWidth: 1,
    borderColor: "#26352d",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chatOnlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#2ed573",
    marginRight: 6,
  },
  chatOnlineTexto: {
    color: "#2ed573",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  chatPresencia: {
    width: "100%",
    minHeight: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  chatPresenciaIzquierda: {
    flexDirection: "row",
    alignItems: "center",
  },
  chatPresenciaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2ed573",
    marginRight: 11,
  },
  chatPresenciaTitulo: {
    color: "#f1f2f4",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 3,
  },
  chatPresenciaSubtitulo: {
    color: "#646c77",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  chatPresenciaAccion: {
    color: "#8c939e",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  chatUsuariosPanel: {
    width: "100%",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
  },
  chatUsuarioFila: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
  },
  chatUsuarioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2ed573",
    marginRight: 9,
  },
  chatUsuarioNombre: {
    flex: 1,
    color: "#cbd0d7",
    fontSize: 12,
    fontWeight: "600",
  },
  chatUsuarioTu: {
    color: "#FACC15",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },

  chatConversacion: {
    flex: 1,
    width: "100%",
    marginTop: 10,
    position: "relative",
  },
  chatListaContenido: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  chatVacio: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 0,
  },
  chatVacioTitulo: {
    color: "#555d68",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 7,
  },
  chatVacioTexto: {
    color: "#454c56",
    fontSize: 12,
    fontWeight: "600",
  },
  chatInputFila: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  chatInput: {
    flex: 1,
    height: 52,
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#303640",
    borderRadius: 14,
    paddingHorizontal: 16,
    color: "#ffffff",
    fontSize: 14,
    marginRight: 9,
  },
  chatEnviar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#FACC15",
    justifyContent: "center",
    alignItems: "center",
  },
  chatEnviarTexto: {
    color: "#11141a",
    fontSize: 30,
    fontWeight: "500",
    marginTop: -3,
  },
  chatCambiarModo: {
    width: "100%",
    minHeight: 62,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    paddingHorizontal: 17,
    marginBottom: 11,
  },
  chatCambiarLabel: {
    color: "#737b86",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  chatCambiarTitulo: {
    color: "#f1f2f4",
    fontSize: 14,
    fontWeight: "800",
  },
  chatCambiarFlecha: {
    color: "#69717d",
    fontSize: 30,
    fontWeight: "300",
  },
  chatFooterTexto: {
    color: "#414751",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    textAlign: "center",
    marginBottom: 14,
  },

  /* ===== RADIO PTT ===== */
  radioScreen: {
    flex: 1,
    backgroundColor: "#11141a",
    paddingTop: Platform.OS === "ios" ? 48 : 34,
    paddingHorizontal: 22,
    paddingBottom: 26,
  },
  radioHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  radioEyebrow: {
    color: "#7f8794",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 5,
  },
  radioBrand: {
    color: "#FACC15",
    fontSize: 22,
    fontWeight: "900",
  },
  radioHome: {
    borderWidth: 1,
    borderColor: "#343a43",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  radioHomeTexto: {
    color: "#aab0b9",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  radioDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#252a31",
    marginTop: 18,
  },
  radioMeta: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 16,
  },
  radioModoLabel: {
    color: "#FACC15",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 5,
  },
  radioOperador: {
    color: "#8b929d",
    fontSize: 12,
    fontWeight: "600",
  },
  radioOnlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161b1b",
    borderWidth: 1,
    borderColor: "#26352d",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  radioOnlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#2ed573",
    marginRight: 6,
  },
  radioOnlineTexto: {
    color: "#2ed573",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  radioPresencia: {
    width: "100%",
    minHeight: 66,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  radioPresenciaIzquierda: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioPresenciaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2ed573",
    marginRight: 11,
  },
  radioPresenciaTitulo: {
    color: "#f1f2f4",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 3,
  },
  radioPresenciaSubtitulo: {
    color: "#646c77",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  radioPresenciaAccion: {
    color: "#8c939e",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  radioUsuariosPanel: {
    width: "100%",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
  },
  radioUsuarioFila: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
  },
  radioUsuarioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2ed573",
    marginRight: 9,
  },
  radioUsuarioNombre: {
    flex: 1,
    color: "#cbd0d7",
    fontSize: 12,
    fontWeight: "600",
  },
  radioUsuarioTu: {
    color: "#FACC15",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },

  radioEstado: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
  },
  radioEstadoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 9,
  },
  radioEstadoTexto: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.1,
    textAlign: "center",
  },
  radioPTTArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 245,
  },
  radioPTTHint: {
    color: "#606873",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 18,
  },
  radioCambiarModo: {
    width: "100%",
    minHeight: 64,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 14,
    paddingHorizontal: 17,
    marginBottom: 13,
  },
  radioCambiarLabel: {
    color: "#737b86",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  radioCambiarTitulo: {
    color: "#f1f2f4",
    fontSize: 14,
    fontWeight: "800",
  },
  radioCambiarFlecha: {
    color: "#69717d",
    fontSize: 30,
    fontWeight: "300",
  },
  radioFooterTexto: {
    color: "#414751",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    textAlign: "center",
    marginBottom: 14,
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
  /* ===== SELECTOR DE CANALES ===== */
  selectorScreen: {
    flex: 1,
    backgroundColor: "#11141a",
    paddingTop: Platform.OS === "ios" ? 48 : 34,
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  selectorHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorEyebrow: {
    color: "#7f8794",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 5,
  },
  selectorBrand: {
    color: "#FACC15",
    fontSize: 21,
    fontWeight: "900",
  },
  selectorModoBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectorModoRadio: {
    backgroundColor: "#161b1b",
    borderColor: "#26352d",
  },
  selectorModoChat: {
    backgroundColor: "#181a20",
    borderColor: "#343944",
  },
  selectorModoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  selectorModoDotRadio: {
    backgroundColor: "#2ed573",
  },
  selectorModoDotChat: {
    backgroundColor: "#FACC15",
  },
  selectorModoTexto: {
    color: "#e8e9eb",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  selectorDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#252a31",
    marginTop: 20,
  },
  selectorIntro: {
    width: "100%",
    marginTop: 30,
    marginBottom: 22,
  },
  selectorLabel: {
    color: "#FACC15",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 7,
  },
  selectorTitulo: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 7,
  },
  selectorDescripcion: {
    color: "#858d99",
    fontSize: 13,
  },
  selectorLista: {
    width: "100%",
  },
  selectorCanal: {
    width: "100%",
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderRadius: 16,
    paddingHorizontal: 15,
    marginBottom: 12,
  },
  selectorCanalNumero: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: "#20242a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  selectorCanalNumeroTexto: {
    color: "#FACC15",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  selectorCanalInfo: {
    flex: 1,
  },
  selectorCanalNombre: {
    color: "#f5f6f7",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  selectorCanalEstado: {
    color: "#2ed573",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  selectorCanalFlecha: {
    color: "#69717d",
    fontSize: 30,
    fontWeight: "300",
  },
  selectorFooter: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  selectorVolver: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  selectorVolverFlecha: {
    color: "#9ba2ad",
    fontSize: 24,
    marginRight: 8,
  },
  selectorVolverTexto: {
    color: "#9ba2ad",
    fontSize: 13,
    fontWeight: "700",
  },
  selectorFooterTexto: {
    color: "#414751",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.7,
    marginTop: 4,
    marginBottom: 18,
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
    maxWidth: "82%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  burbujaMia: {
    backgroundColor: "#24251f",
    borderWidth: 1,
    borderColor: "#4a4626",
    borderBottomRightRadius: 4,
  },
  burbujaAjena: {
    backgroundColor: "#171a1f",
    borderWidth: 1,
    borderColor: "#292e36",
    borderBottomLeftRadius: 4,
  },
  textoEmisorChat: {
    color: "#2ed573",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 4,
  },
  textoMensajeChat: {
    color: "#f1f2f4",
    fontSize: 14,
    lineHeight: 20,
  },
  textoHoraChat: {
    color: "#737b86",
    fontSize: 9,
    alignSelf: "flex-end",
    marginTop: 5,
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