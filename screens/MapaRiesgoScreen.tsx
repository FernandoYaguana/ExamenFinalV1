import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { StatusBar } from 'expo-status-bar';

const ALERT_LEVELS = [
  { label: 'Vigilancia normal', color: '#22c55e', icon: '🟢' },
  { label: 'Actividad inusual', color: '#eab308', icon: '🟡' },
  { label: 'Varios reportes', color: '#f97316', icon: '🟠' },
  { label: 'Riesgo activo', color: '#ef4444', icon: '🔴' },
];

const ZONES = [
  {
    id: 1,
    title: 'Zona Centro',
    latitude: -0.1807,
    longitude: -78.4678,
    level: 0,
    radius: 300,
  },
  {
    id: 2,
    title: 'Zona Norte',
    latitude: -0.1725,
    longitude: -78.4756,
    level: 1,
    radius: 250,
  },
  {
    id: 3,
    title: 'Zona Sur',
    latitude: -0.1895,
    longitude: -78.4725,
    level: 2,
    radius: 280,
  },
  {
    id: 4,
    title: 'Zona Este',
    latitude: -0.1838,
    longitude: -78.4595,
    level: 3,
    radius: 200,
  },
  {
    id: 5,
    title: 'Zona Oeste',
    latitude: -0.1765,
    longitude: -78.4835,
    level: 0,
    radius: 320,
  },
];

const INITIAL_REGION = {
  latitude: -0.1807,
  longitude: -78.4678,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

// --- CONFIGURACION AZURE OPENAI ---
const AZURE_ENDPOINT = process.env.EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT ?? '';
const AZURE_KEY = process.env.EXPO_PUBLIC_AZURE_OPENAI_KEY ?? '';
const API_VERSION = process.env.EXPO_PUBLIC_OPENAI_API_VERSION ?? '2024-08-01-preview';
const AGENT_TEMPERATURE = 0.8;
const AGENT_MODEL = 'gpt-4o';
const SYSTEM_PROMPT =
  'Eres un agente experto SOLO en React Native. ' +
  'Responde UNICAMENTE preguntas sobre React Native en máximo 50 caracteres. ' +
  'Si la pregunta NO es sobre React Native, responde exactamente: "Solo sé sobre React Native."';

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface AgentResult {
  answer: string;
  usage: TokenUsage;
}

async function askAgent(userQuestion: string): Promise<AgentResult> {
  const url = `${AZURE_ENDPOINT}openai/deployments/${AGENT_MODEL}/chat/completions?api-version=${API_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_KEY,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userQuestion },
      ],
      temperature: AGENT_TEMPERATURE,
      max_tokens: 60,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Error al consultar Azure OpenAI');
  }

  return {
    answer: data.choices[0].message.content.trim(),
    usage: data.usage,
  };
}

interface Question {
  id: number;
  text: string;
  answer: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: string;
}

export default function MapaRiesgoScreen() {
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showQuestions, setShowQuestions] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmitQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setQuestion('');

    try {
      const { answer, usage } = await askAgent(trimmed);
      const newQuestion: Question = {
        id: Date.now(),
        text: trimmed,
        answer,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        timestamp: new Date().toLocaleTimeString(),
      };
      setQuestions((prev) => [newQuestion, ...prev]);
      setTotalTokens((prev) => prev + usage.total_tokens);
    } catch (error: any) {
      const errorQuestion: Question = {
        id: Date.now(),
        text: trimmed,
        answer: `Error: ${error.message}`,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        timestamp: new Date().toLocaleTimeString(),
      };
      setQuestions((prev) => [errorQuestion, ...prev]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-black"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View className="bg-neutral-900 pt-12 pb-3 px-4">
        <Text className="text-white text-xl font-bold">
          Mapa de zonas de riesgo
        </Text>
      </View>

      {/* Legend */}
      <View className="bg-neutral-900 px-4 pb-3">
        <Text className="text-gray-400 text-sm font-semibold mb-2">
          Estados de alerta
        </Text>
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          {ALERT_LEVELS.map((level) => (
            <View key={level.label} className="flex-row items-center gap-1">
              <View
                style={[styles.dot, { backgroundColor: level.color }]}
              />
              <Text className="text-gray-300 text-xs">{level.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Map */}
      <View className="flex-1">
        <MapView style={styles.map} initialRegion={INITIAL_REGION}>
          {ZONES.map((zone) => (
            <View key={zone.id}>
              <Circle
                center={{ latitude: zone.latitude, longitude: zone.longitude }}
                radius={zone.radius}
                fillColor={ALERT_LEVELS[zone.level].color + '30'}
                strokeColor={ALERT_LEVELS[zone.level].color + '80'}
                strokeWidth={2}
              />
              <Marker
                coordinate={{
                  latitude: zone.latitude,
                  longitude: zone.longitude,
                }}
                title={zone.title}
                description={ALERT_LEVELS[zone.level].label}
                pinColor={ALERT_LEVELS[zone.level].color}
                onPress={() => setSelectedZone(zone.id)}
              />
            </View>
          ))}
        </MapView>
      </View>

      {/* React Native Questions Section */}
      <View className="bg-neutral-900 px-4 pt-3 pb-2">
        <TouchableOpacity
          onPress={() => setShowQuestions(!showQuestions)}
          activeOpacity={0.7}
          className="flex-row items-center justify-between mb-2"
        >
          <Text className="text-white text-base font-bold">
            Preguntas sobre React Native
          </Text>
          <Text className="text-gray-400 text-lg">
            {showQuestions ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {showQuestions && (
          <View>
            {/* Agent Config Bar */}
            <View className="bg-neutral-800 rounded-lg px-3 py-2 mb-2">
              <View className="flex-row justify-between">
                <Text className="text-gray-400 text-xs">
                  Modelo: <Text className="text-white font-semibold">{AGENT_MODEL}</Text>
                </Text>
                <Text className="text-gray-400 text-xs">
                  Temperatura: <Text className="text-yellow-400 font-semibold">{AGENT_TEMPERATURE}</Text>
                </Text>
              </View>
              <View className="flex-row justify-center mt-1">
                <Text className="text-cyan-400 text-xs font-semibold">
                  Total tokens consumidos: {totalTokens}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-2 mb-2">
              <TextInput
                className="flex-1 bg-neutral-800 text-white px-3 py-2 rounded-lg text-sm"
                placeholder="Escribe tu pregunta sobre React Native..."
                placeholderTextColor="#9ca3af"
                value={question}
                onChangeText={setQuestion}
                onSubmitEditing={handleSubmitQuestion}
                returnKeyType="send"
              />
              <TouchableOpacity
                onPress={handleSubmitQuestion}
                activeOpacity={0.7}
                className="bg-blue-500 px-4 py-2 rounded-lg"
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-sm">Enviar</Text>
                )}
              </TouchableOpacity>
            </View>

            {questions.length > 0 ? (
              <FlatList
                data={questions}
                keyExtractor={(item) => item.id.toString()}
                style={styles.questionList}
                renderItem={({ item }) => (
                  <View className="mb-2">
                    <View className="bg-neutral-800 rounded-lg px-3 py-2">
                      <Text className="text-blue-400 text-xs font-bold mb-1">Tú:</Text>
                      <Text className="text-white text-sm">{item.text}</Text>
                    </View>
                    <View className="bg-neutral-700 rounded-lg px-3 py-2 mt-1 ml-4">
                      <Text className="text-green-400 text-xs font-bold mb-1">Agente RN:</Text>
                      <Text className="text-gray-200 text-sm">{item.answer}</Text>
                    </View>
                    <View className="flex-row justify-between mt-1 px-1">
                      <Text className="text-gray-600 text-xs">
                        Prompt: {item.promptTokens} | Resp: {item.completionTokens} | Total: {item.totalTokens}
                      </Text>
                      <Text className="text-gray-500 text-xs">{item.timestamp}</Text>
                    </View>
                  </View>
                )}
              />
            ) : (
              <Text className="text-gray-500 text-xs text-center py-2">
                Aún no hay preguntas. Escribe una pregunta relacionada con React Native.
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Bottom Buttons */}
      <View className="flex-row px-4 py-4 gap-3 bg-neutral-900">
        <TouchableOpacity
          className="flex-1 bg-neutral-700 py-3 rounded-lg items-center"
          activeOpacity={0.7}
        >
          <Text className="text-white font-semibold text-base">Historial</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 bg-orange-500 py-3 rounded-lg items-center"
          activeOpacity={0.7}
        >
          <Text className="text-white font-semibold text-base">Reportar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  questionList: {
    maxHeight: 200,
  },
});
