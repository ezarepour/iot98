import "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";

type AlertThreshold = 38.0 | 38.5 | 39.0;
type Gender = "male" | "female" | "other";
type EventType = "sponge" | "medicine";

type UserAccount = {
  id: string;
  firstName: string;
  lastName: string;
  mobile: string;
  password: string;
};

type ChildProfile = {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate: string;
  birthWeightKg: string;
  gestationalWeeks: string;
  feverAlertThresholdC: AlertThreshold;
};

type FeverSample = {
  measuredAt: string;
  tempC: number;
  batteryPercent: number;
  signalPercent: number;
  isWarmup: boolean;
};

type FeverEvent = {
  id: string;
  eventType: EventType;
  medicineName?: string;
  medicineDose?: string;
  note?: string;
  eventAt: string;
};

type FeverSession = {
  id: string;
  childId: string;
  diseaseLabel: string;
  source: "local" | "remote";
  startedAt: string;
  endedAt: string;
  peakTempC: number;
  peakTempAt: string;
  samples: FeverSample[];
  events: FeverEvent[];
};

type JaundiceCapture = {
  id: string;
  uri: string;
  isFlash: boolean;
  roiNote: string;
  capturedAt: string;
};

type JaundiceTest = {
  id: string;
  childId: string;
  captures: JaundiceCapture[];
  estimatedLevel: number;
  recommendation: string;
  createdAt: string;
};

type VaccinationRecord = {
  id: string;
  childId: string;
  vaccineName: string;
  recommendedAgeMonths: number;
  injectionDate: string;
  sideEffects: string[];
};

type GrowthRecord = {
  id: string;
  childId: string;
  measuredAt: string;
  weightKg: string;
  heightCm: string;
  headCircumferenceCm: string;
};

type ChatMessage = {
  id: string;
  senderRole: "parent" | "doctor";
  text: string;
  sentAt: string;
};

type ConsultationThread = {
  id: string;
  childId: string;
  doctorName: string;
  specialty: string;
  feeAmount: number;
  paymentStatus: "pending" | "paid";
  status: "awaiting_payment" | "active" | "closed";
  summaryItems: string[];
  messages: ChatMessage[];
  createdAt: string;
};

type RemoteMessage = {
  id: string;
  childId: string;
  sender: "parent" | "caregiver";
  text: string;
  sentAt: string;
};

type AppSettings = {
  notificationsEnabled: boolean;
  notificationChannel: "push" | "sms";
};

type AppData = {
  users: UserAccount[];
  sessionMobile: string | null;
  children: ChildProfile[];
  feverSessions: FeverSession[];
  jaundiceTests: JaundiceTest[];
  vaccinationRecords: VaccinationRecord[];
  growthRecords: GrowthRecord[];
  consultations: ConsultationThread[];
  remoteMessages: RemoteMessage[];
  settings: AppSettings;
};

const STORAGE_KEY = "kidk-mobile-data-v1";

const initialData: AppData = {
  users: [],
  sessionMobile: null,
  children: [],
  feverSessions: [],
  jaundiceTests: [],
  vaccinationRecords: [],
  growthRecords: [],
  consultations: [],
  remoteMessages: [],
  settings: {
    notificationsEnabled: true,
    notificationChannel: "push",
  },
};

const vaccineCatalog = [
  { name: "بدو تولد (BCG / هپاتیت B)", ageMonths: 0 },
  { name: "۲ ماهگی", ageMonths: 2 },
  { name: "۴ ماهگی", ageMonths: 4 },
  { name: "۶ ماهگی", ageMonths: 6 },
  { name: "۱۲ ماهگی", ageMonths: 12 },
  { name: "۱۸ ماهگی", ageMonths: 18 },
  { name: "۴ تا ۶ سالگی", ageMonths: 48 },
];

const doctorDirectory = [
  { name: "دکتر احمدی", specialty: "اطفال", fee: 650000, rating: 4.8 },
  { name: "دکتر رضایی", specialty: "نوزادان", fee: 820000, rating: 4.9 },
  { name: "دکتر کریمی", specialty: "عفونی کودکان", fee: 740000, rating: 4.6 },
];

const Stack = createNativeStackNavigator();

function uuid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fa-IR")} ${d.toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatDateOnly(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fa-IR");
}

function ageMonthsFromBirthDate(birthDate: string) {
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) {
    return 0;
  }
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12;
  months += now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) {
    months -= 1;
  }
  return Math.max(months, 0);
}

function nextVaccineInfo(child: ChildProfile, records: VaccinationRecord[]) {
  const age = ageMonthsFromBirthDate(child.birthDate);
  const childRecords = records.filter((r) => r.childId === child.id);
  for (const item of vaccineCatalog) {
    const done = childRecords.some(
      (r) => r.vaccineName === item.name && r.recommendedAgeMonths === item.ageMonths,
    );
    if (!done) {
      const monthsLeft = item.ageMonths - age;
      return {
        vaccineName: item.name,
        monthsLeft,
        isOverdue: monthsLeft < 0,
      };
    }
  }
  return null;
}

function recommendationForJaundice(level: number) {
  if (level >= 18) {
    return "نیاز به مراجعه فوری به بیمارستان";
  }
  if (level >= 14) {
    return "مراجعه سریع به پزشک در همان روز توصیه می‌شود";
  }
  if (level >= 10) {
    return "پایش دقیق، تغذیه مناسب و تکرار سنجش در ۱۲ ساعت آینده";
  }
  return "سطح زردی فعلا پایین است؛ طبق برنامه پایش ادامه یابد";
}

function App() {
  const [data, setData] = useState<AppData>(initialData);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && mounted) {
          const parsed = JSON.parse(stored) as AppData;
          setData({ ...initialData, ...parsed });
        }
      } catch (e) {
        console.error("Failed to load local data", e);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((e) =>
      console.error("Failed to persist local data", e),
    );
  }, [data, isLoading]);

  const currentUser = useMemo(
    () => data.users.find((u) => u.mobile === data.sessionMobile) ?? null,
    [data.users, data.sessionMobile],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#0b84ff" />
        <Text style={styles.mutedText}>در حال بارگذاری اطلاعات...</Text>
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <>
        <AuthScreen
          users={data.users}
          onSignup={(payload) => {
            const exists = data.users.some((u) => u.mobile === payload.mobile);
            if (exists) {
              Alert.alert("خطا", "این شماره موبایل قبلا ثبت‌نام شده است.");
              return;
            }
            const newUser: UserAccount = {
              id: uuid(),
              ...payload,
            };
            setData((prev) => ({
              ...prev,
              users: [...prev.users, newUser],
              sessionMobile: newUser.mobile,
            }));
          }}
          onLogin={(mobile, password) => {
            const user = data.users.find((u) => u.mobile === mobile && u.password === password);
            if (!user) {
              Alert.alert("ورود ناموفق", "شماره موبایل یا رمز عبور صحیح نیست.");
              return;
            }
            setData((prev) => ({ ...prev, sessionMobile: mobile }));
          }}
        />
        <StatusBar style="dark" />
      </>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Dashboard" options={{ title: "داشبورد کیدک" }}>
          {(props) => (
            <DashboardScreen
              {...props}
              data={data}
              currentUser={currentUser}
              onLogout={() => setData((prev) => ({ ...prev, sessionMobile: null }))}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Children" options={{ title: "مدیریت کودکان" }}>
          {(props) => (
            <ChildrenScreen
              {...props}
              children={data.children}
              onSaveChild={(child) => {
                setData((prev) => {
                  const exists = prev.children.some((c) => c.id === child.id);
                  if (exists) {
                    return {
                      ...prev,
                      children: prev.children.map((c) => (c.id === child.id ? child : c)),
                    };
                  }
                  return {
                    ...prev,
                    children: [...prev.children, child],
                  };
                });
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="FeverMonitor" options={{ title: "پایش تب" }}>
          {(props) => (
            <FeverMonitorScreen
              {...props}
              children={data.children}
              previousSessions={data.feverSessions}
              onSaveSession={(session) =>
                setData((prev) => ({ ...prev, feverSessions: [...prev.feverSessions, session] }))
              }
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="FeverHistory" options={{ title: "سوابق تب" }}>
          {(props) => (
            <FeverHistoryScreen {...props} children={data.children} sessions={data.feverSessions} />
          )}
        </Stack.Screen>

        <Stack.Screen name="Jaundice" options={{ title: "پایش زردی" }}>
          {(props) => (
            <JaundiceScreen
              {...props}
              children={data.children}
              tests={data.jaundiceTests}
              onSaveTest={(test) =>
                setData((prev) => ({ ...prev, jaundiceTests: [test, ...prev.jaundiceTests] }))
              }
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Vaccination" options={{ title: "واکسیناسیون" }}>
          {(props) => (
            <VaccinationScreen
              {...props}
              children={data.children}
              records={data.vaccinationRecords}
              onRegisterVaccine={(record) =>
                setData((prev) => ({ ...prev, vaccinationRecords: [...prev.vaccinationRecords, record] }))
              }
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Growth" options={{ title: "پایش رشد" }}>
          {(props) => (
            <GrowthScreen
              {...props}
              children={data.children}
              records={data.growthRecords}
              onAddRecord={(record) =>
                setData((prev) => ({ ...prev, growthRecords: [...prev.growthRecords, record] }))
              }
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Consultation" options={{ title: "مشاوره برخط پزشکی" }}>
          {(props) => (
            <ConsultationScreen
              {...props}
              children={data.children}
              consultations={data.consultations}
              onCreate={(consultation) =>
                setData((prev) => ({ ...prev, consultations: [consultation, ...prev.consultations] }))
              }
              onUpdate={(consultationId, updater) =>
                setData((prev) => ({
                  ...prev,
                  consultations: prev.consultations.map((c) =>
                    c.id === consultationId ? updater(c) : c,
                  ),
                }))
              }
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="RemoteMonitoring" options={{ title: "پایش از راه دور تب" }}>
          {(props) => (
            <RemoteMonitoringScreen
              {...props}
              children={data.children}
              sessions={data.feverSessions}
              messages={data.remoteMessages}
              onAddMessage={(msg) =>
                setData((prev) => ({ ...prev, remoteMessages: [msg, ...prev.remoteMessages] }))
              }
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Settings" options={{ title: "تنظیمات" }}>
          {(props) => (
            <SettingsScreen
              {...props}
              settings={data.settings}
              onUpdateSettings={(settings) => setData((prev) => ({ ...prev, settings }))}
              onChangePassword={(oldPassword, newPassword) => {
                const account = data.users.find((u) => u.mobile === currentUser.mobile);
                if (!account || account.password !== oldPassword) {
                  Alert.alert("خطا", "رمز قبلی صحیح نیست.");
                  return false;
                }
                setData((prev) => ({
                  ...prev,
                  users: prev.users.map((u) =>
                    u.id === account.id ? { ...u, password: newPassword } : u,
                  ),
                }));
                return true;
              }}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
      <StatusBar style="dark" />
    </NavigationContainer>
  );
}

function AuthScreen({
  users,
  onSignup,
  onLogin,
}: {
  users: UserAccount[];
  onSignup: (payload: Omit<UserAccount, "id">) => void;
  onLogin: (mobile: string, password: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);

  const submitSignup = () => {
    if (!mobile || !password || !firstName || !lastName) {
      Alert.alert("ورودی ناقص", "لطفا نام، نام خانوادگی، موبایل و رمز را کامل کنید.");
      return;
    }
    if (!otpRequested) {
      setOtpRequested(true);
      Alert.alert("OTP ارسال شد", "برای نسخه عملیاتی نمونه، کد OTP برابر 123456 است.");
      return;
    }
    if (otpCode !== "123456") {
      Alert.alert("OTP نامعتبر", "کد OTP صحیح نیست.");
      return;
    }
    onSignup({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      mobile: mobile.trim(),
      password,
    });
  };

  return (
    <SafeAreaView style={styles.authContainer}>
      <ScrollView contentContainerStyle={styles.authScroll}>
        <Text style={styles.authTitle}>کیدک</Text>
        <Text style={styles.authSubtitle}>پایش مستمر سلامت کودکان</Text>

        <View style={styles.row}>
          <Pressable
            style={[styles.modeButton, mode === "login" && styles.modeButtonActive]}
            onPress={() => setMode("login")}
          >
            <Text style={mode === "login" ? styles.modeTextActive : styles.modeText}>ورود</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === "signup" && styles.modeButtonActive]}
            onPress={() => setMode("signup")}
          >
            <Text style={mode === "signup" ? styles.modeTextActive : styles.modeText}>ثبت‌نام</Text>
          </Pressable>
        </View>

        {mode === "signup" && (
          <>
            <TextInput
              style={styles.input}
              placeholder="نام"
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              style={styles.input}
              placeholder="نام خانوادگی"
              value={lastName}
              onChangeText={setLastName}
            />
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="شماره موبایل"
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={setMobile}
        />
        <TextInput
          style={styles.input}
          placeholder="رمز عبور"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {mode === "signup" && otpRequested && (
          <TextInput
            style={styles.input}
            placeholder="کد OTP"
            keyboardType="number-pad"
            value={otpCode}
            onChangeText={setOtpCode}
          />
        )}

        {mode === "login" ? (
          <Pressable style={styles.primaryButton} onPress={() => onLogin(mobile.trim(), password)}>
            <Text style={styles.primaryButtonText}>ورود به برنامه</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryButton} onPress={submitSignup}>
            <Text style={styles.primaryButtonText}>
              {otpRequested ? "تکمیل ثبت‌نام" : "ارسال OTP و ادامه"}
            </Text>
          </Pressable>
        )}

        <Text style={styles.mutedText}>تعداد کاربران ثبت‌شده روی این دستگاه: {users.length}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DashboardScreen({
  navigation,
  data,
  currentUser,
  onLogout,
}: {
  navigation: any;
  data: AppData;
  currentUser: UserAccount;
  onLogout: () => void;
}) {
  const lastFever = [...data.feverSessions]
    .sort((a, b) => +new Date(b.endedAt) - +new Date(a.endedAt))
    .at(0);
  const lastJaundice = [...data.jaundiceTests]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .at(0);
  const unreadDoctorMessages = data.consultations.reduce((acc, thread) => {
    const doctorMessages = thread.messages.filter((m) => m.senderRole === "doctor");
    return acc + doctorMessages.length;
  }, 0);

  const vaccineReminders = data.children
    .map((child) => {
      const next = nextVaccineInfo(child, data.vaccinationRecords);
      return { child, next };
    })
    .filter((x) => Boolean(x.next));

  const moduleButtons = [
    { label: "پایش تب", screen: "FeverMonitor" },
    { label: "سوابق تب", screen: "FeverHistory" },
    { label: "پایش زردی", screen: "Jaundice" },
    { label: "واکسیناسیون", screen: "Vaccination" },
    { label: "پایش رشد", screen: "Growth" },
    { label: "مشاوره برخط پزشکی", screen: "Consultation" },
    { label: "گزارش‌گیری", screen: "FeverHistory" },
    { label: "تنظیمات", screen: "Settings" },
    { label: "تعریف کودک جدید", screen: "Children" },
    { label: "پایش از راه دور تب", screen: "RemoteMonitoring" },
    { label: "تغییر کلمه عبور", screen: "Settings" },
  ];

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <Text style={styles.pageTitle}>
          خوش آمدید {currentUser.firstName} {currentUser.lastName}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>داشبورد سلامت</Text>
          <Text style={styles.cardItem}>
            آخرین تب:{" "}
            {lastFever ? `${lastFever.peakTempC.toFixed(1)}°C (${formatDateTime(lastFever.peakTempAt)})` : "ثبت نشده"}
          </Text>
          <Text style={styles.cardItem}>
            آخرین زردی:{" "}
            {lastJaundice
              ? `${lastJaundice.estimatedLevel.toFixed(2)} (${formatDateTime(lastJaundice.createdAt)})`
              : "ثبت نشده"}
          </Text>
          <Text style={styles.cardItem}>
            یادآور واکسن: {vaccineReminders.length > 0 ? `${vaccineReminders.length} مورد فعال` : "موردی نیست"}
          </Text>
          <Text style={styles.cardItem}>پیام‌های پزشک: {unreadDoctorMessages} پیام</Text>
        </View>

        {vaccineReminders.map(({ child, next }) => (
          <View key={child.id} style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              {child.firstName}: واکسن {next?.vaccineName}{" "}
              {next?.isOverdue ? "عقب افتاده است" : `${next?.monthsLeft} ماه دیگر`}
            </Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>بخش‌های نرم‌افزار</Text>
        <View style={styles.grid}>
          {moduleButtons.map((item) => (
            <Pressable key={item.label} style={styles.moduleButton} onPress={() => navigation.navigate(item.screen)}>
              <Text style={styles.moduleText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>خروج از حساب کاربری</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChildrenScreen({
  children,
  onSaveChild,
}: {
  children: ChildProfile[];
  onSaveChild: (child: ChildProfile) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [birthDate, setBirthDate] = useState("");
  const [birthWeightKg, setBirthWeightKg] = useState("");
  const [gestationalWeeks, setGestationalWeeks] = useState("");
  const [threshold, setThreshold] = useState<AlertThreshold>(38.5);

  const resetForm = () => {
    setEditingId(null);
    setFirstName("");
    setLastName("");
    setGender("male");
    setBirthDate("");
    setBirthWeightKg("");
    setGestationalWeeks("");
    setThreshold(38.5);
  };

  const loadChild = (child: ChildProfile) => {
    setEditingId(child.id);
    setFirstName(child.firstName);
    setLastName(child.lastName);
    setGender(child.gender);
    setBirthDate(child.birthDate);
    setBirthWeightKg(child.birthWeightKg);
    setGestationalWeeks(child.gestationalWeeks);
    setThreshold(child.feverAlertThresholdC);
  };

  const save = () => {
    if (!firstName || !lastName || !birthDate) {
      Alert.alert("ورودی ناقص", "نام، نام خانوادگی و تاریخ تولد الزامی است.");
      return;
    }
    const child: ChildProfile = {
      id: editingId ?? uuid(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      gender,
      birthDate: birthDate.trim(),
      birthWeightKg: birthWeightKg.trim(),
      gestationalWeeks: gestationalWeeks.trim(),
      feverAlertThresholdC: threshold,
    };
    onSaveChild(child);
    resetForm();
    Alert.alert("ثبت شد", "اطلاعات کودک با موفقیت ذخیره شد.");
  };

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <Text style={styles.sectionTitle}>ثبت / ویرایش کودک</Text>
        <TextInput style={styles.input} placeholder="نام" value={firstName} onChangeText={setFirstName} />
        <TextInput style={styles.input} placeholder="نام خانوادگی" value={lastName} onChangeText={setLastName} />
        <TextInput
          style={styles.input}
          placeholder="تاریخ تولد (مثال: 2024-03-12)"
          value={birthDate}
          onChangeText={setBirthDate}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="وزن تولد (کیلوگرم)"
            value={birthWeightKg}
            onChangeText={setBirthWeightKg}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="هفته بارداری"
            value={gestationalWeeks}
            onChangeText={setGestationalWeeks}
            keyboardType="number-pad"
          />
        </View>

        <Text style={styles.label}>جنسیت</Text>
        <View style={styles.row}>
          {[
            { value: "male", label: "پسر" },
            { value: "female", label: "دختر" },
            { value: "other", label: "سایر" },
          ].map((g) => (
            <Pressable
              key={g.value}
              style={[styles.tag, gender === g.value && styles.tagActive]}
              onPress={() => setGender(g.value as Gender)}
            >
              <Text style={gender === g.value ? styles.tagTextActive : styles.tagText}>{g.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>آستانه هشدار تب</Text>
        <View style={styles.row}>
          {[38.0, 38.5, 39.0].map((t) => (
            <Pressable
              key={t}
              style={[styles.tag, threshold === t && styles.tagActive]}
              onPress={() => setThreshold(t as AlertThreshold)}
            >
              <Text style={threshold === t ? styles.tagTextActive : styles.tagText}>{t}°C</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.primaryButton} onPress={save}>
          <Text style={styles.primaryButtonText}>{editingId ? "ذخیره تغییرات" : "افزودن کودک"}</Text>
        </Pressable>

        {editingId && (
          <Pressable style={styles.secondaryButton} onPress={resetForm}>
            <Text style={styles.secondaryButtonText}>انصراف از ویرایش</Text>
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>کودکان ثبت‌شده</Text>
        {children.length === 0 ? (
          <Text style={styles.mutedText}>هنوز کودکی ثبت نشده است.</Text>
        ) : (
          children.map((child) => (
            <View key={child.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {child.firstName} {child.lastName}
              </Text>
              <Text style={styles.cardItem}>تولد: {child.birthDate}</Text>
              <Text style={styles.cardItem}>آستانه هشدار: {child.feverAlertThresholdC}°C</Text>
              <Pressable style={styles.inlineButton} onPress={() => loadChild(child)}>
                <Text style={styles.inlineButtonText}>ویرایش</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeverMonitorScreen({
  children,
  previousSessions,
  onSaveSession,
}: {
  children: ChildProfile[];
  previousSessions: FeverSession[];
  onSaveSession: (session: FeverSession) => void;
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(children[0]?.id ?? null);
  const [phase, setPhase] = useState<"idle" | "connecting" | "warmup" | "monitoring">("idle");
  const [samples, setSamples] = useState<FeverSample[]>([]);
  const [events, setEvents] = useState<FeverEvent[]>([]);
  const [battery, setBattery] = useState(95);
  const [signal, setSignal] = useState(88);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [stopModalVisible, setStopModalVisible] = useState(false);
  const [eventType, setEventType] = useState<EventType>("sponge");
  const [medicineName, setMedicineName] = useState("");
  const [medicineDose, setMedicineDose] = useState("");
  const [eventNote, setEventNote] = useState("");
  const [diseaseLabel, setDiseaseLabel] = useState("");
  const tickRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestHighAlertRef = useRef(0);

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const threshold = selectedChild?.feverAlertThresholdC ?? 38.5;

  const lastSessionForChild = useMemo(() => {
    if (!selectedChildId) {
      return null;
    }
    return [...previousSessions]
      .filter((s) => s.childId === selectedChildId)
      .sort((a, b) => +new Date(b.endedAt) - +new Date(a.endedAt))
      .at(0);
  }, [previousSessions, selectedChildId]);

  useEffect(() => {
    if (lastSessionForChild?.diseaseLabel) {
      setDiseaseLabel(lastSessionForChild.diseaseLabel);
    } else {
      setDiseaseLabel("");
    }
  }, [lastSessionForChild]);

  useEffect(() => {
    if (phase === "idle") {
      return;
    }
    if (phase === "connecting") {
      const connectTimeout = setTimeout(() => {
        setPhase("warmup");
      }, 1600);
      return () => clearTimeout(connectTimeout);
    }

    intervalRef.current = setInterval(() => {
      tickRef.current += 1;

      const isWarmup = phase === "warmup";
      let temp: number;
      if (isWarmup) {
        temp = 34 + Math.random() * 2;
        if (tickRef.current >= 4) {
          setPhase("monitoring");
        }
      } else {
        temp = 36.7 + Math.random() * 2.3;
        if (Math.random() < 0.12) {
          temp += 0.7;
        }
        if (Math.random() < 0.01) {
          temp = 31.6;
        }
      }
      temp = Math.round(temp * 10) / 10;

      const nextBattery = Math.max(1, battery - (Math.random() < 0.5 ? 1 : 0));
      const nextSignal = Math.max(10, Math.round(55 + Math.random() * 45));
      setBattery(nextBattery);
      setSignal(nextSignal);

      const sample: FeverSample = {
        measuredAt: new Date().toISOString(),
        tempC: temp,
        batteryPercent: nextBattery,
        signalPercent: nextSignal,
        isWarmup,
      };
      setSamples((prev) => [...prev, sample]);

      if (!isWarmup && temp > threshold) {
        const now = Date.now();
        if (now - latestHighAlertRef.current > 30000) {
          latestHighAlertRef.current = now;
          Alert.alert("هشدار تب", `دمای کودک از آستانه ${threshold} بالاتر رفته است.`);
        }
      }

      if (temp < 32) {
        Alert.alert("هشدار جدا شدن تب‌سنج", "احتمالا تب‌سنج از کودک جدا شده است.");
      }
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [phase, threshold, battery]);

  const startMonitoring = () => {
    if (!selectedChild) {
      Alert.alert("انتخاب کودک", "لطفا ابتدا کودک را انتخاب کنید.");
      return;
    }
    setSamples([]);
    setEvents([]);
    setBattery(95);
    setSignal(88);
    tickRef.current = 0;
    latestHighAlertRef.current = 0;
    setStartedAt(new Date().toISOString());
    setPhase("connecting");
  };

  const resetMonitor = () => {
    setPhase("idle");
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSamples([]);
    setEvents([]);
    setStartedAt(null);
  };

  const stopAndSave = () => {
    if (!selectedChild || !startedAt) {
      setStopModalVisible(false);
      resetMonitor();
      return;
    }
    if (!diseaseLabel.trim()) {
      Alert.alert("عنوان بیماری", "برای ثبت سوابق، عنوان بیماری یا وضعیت را وارد کنید.");
      return;
    }
    const realSamples = samples.filter((s) => !s.isWarmup);
    const baseSamples = realSamples.length > 0 ? realSamples : samples;
    const peak = baseSamples.reduce(
      (acc, s) => (s.tempC > acc.tempC ? { tempC: s.tempC, measuredAt: s.measuredAt } : acc),
      { tempC: 0, measuredAt: startedAt },
    );
    const session: FeverSession = {
      id: uuid(),
      childId: selectedChild.id,
      diseaseLabel: diseaseLabel.trim(),
      source: "local",
      startedAt,
      endedAt: new Date().toISOString(),
      peakTempC: peak.tempC,
      peakTempAt: peak.measuredAt,
      samples,
      events,
    };
    onSaveSession(session);
    setStopModalVisible(false);
    resetMonitor();
    Alert.alert("ثبت شد", "سوابق پایش تب ذخیره شد.");
  };

  const addEvent = () => {
    if (eventType === "medicine" && (!medicineName.trim() || !medicineDose.trim())) {
      Alert.alert("اطلاعات دارو", "نام دارو و دوز را وارد کنید.");
      return;
    }
    const event: FeverEvent = {
      id: uuid(),
      eventType,
      medicineName: eventType === "medicine" ? medicineName.trim() : undefined,
      medicineDose: eventType === "medicine" ? medicineDose.trim() : undefined,
      note: eventNote.trim() || undefined,
      eventAt: new Date().toISOString(),
    };
    setEvents((prev) => [...prev, event]);
    setMedicineName("");
    setMedicineDose("");
    setEventNote("");
    setEventType("sponge");
    setEventModalVisible(false);
  };

  const currentTemp = samples.at(-1)?.tempC ?? 0;
  const isRunning = phase !== "idle";
  const warmupMessage = phase === "warmup";
  const chartDataValues = samples.map((s) => s.tempC);
  const chartLabels = samples.map((s, idx) => {
    if (idx % Math.ceil(Math.max(1, samples.length / 6)) !== 0 && idx !== samples.length - 1) {
      return "";
    }
    const d = new Date(s.measuredAt);
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
  });
  const chartWidth = Math.max(320, Dimensions.get("window").width - 32);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        {children.length === 0 ? (
          <Text style={styles.mutedText}>ابتدا در بخش مدیریت کودکان، کودک را ثبت کنید.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>انتخاب کودک</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
              {children.map((child) => (
                <Pressable
                  key={child.id}
                  style={[styles.tag, selectedChildId === child.id && styles.tagActive]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={selectedChildId === child.id ? styles.tagTextActive : styles.tagText}>
                    {child.firstName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>وضعیت اتصال تب‌سنج</Text>
              <Text style={styles.cardItem}>
                وضعیت:{" "}
                {phase === "idle"
                  ? "آماده شروع"
                  : phase === "connecting"
                    ? "در حال اتصال بلوتوث..."
                    : phase === "warmup"
                      ? "هم‌دمایی اولیه"
                      : "پایش فعال"}
              </Text>
              <Text style={styles.cardItem}>شارژ: {battery}%</Text>
              <Text style={styles.cardItem}>کیفیت آنتن: {signal}%</Text>
              <Text style={styles.cardItem}>آستانه هشدار: {threshold}°C</Text>
            </View>

            <Text style={styles.bigTemp}>{currentTemp ? `${currentTemp.toFixed(1)}°C` : "--.-°C"}</Text>

            {warmupMessage && (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>تب‌سنج هنوز به دمای کودک نرسیده است.</Text>
              </View>
            )}

            <View style={styles.chartWrapper}>
              <Text style={styles.sectionTitle}>نمودار تب</Text>
              {chartDataValues.length > 1 ? (
                <LineChart
                  data={{
                    labels: chartLabels,
                    datasets: [{ data: chartDataValues }],
                  }}
                  width={chartWidth}
                  height={220}
                  yAxisSuffix="°"
                  chartConfig={{
                    backgroundColor: "#ffffff",
                    backgroundGradientFrom: "#ffffff",
                    backgroundGradientTo: "#ffffff",
                    decimalPlaces: 1,
                    color: (opacity = 1) => `rgba(11, 132, 255, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(18, 26, 36, ${opacity})`,
                    propsForDots: {
                      r: "3",
                      strokeWidth: "1",
                      stroke: "#0b84ff",
                    },
                  }}
                  bezier
                  withInnerLines
                  style={styles.chartStyle}
                />
              ) : (
                <Text style={styles.mutedText}>با شروع پایش، نمودار نمایش داده می‌شود.</Text>
              )}
            </View>

            {samples.length > 0 && (
              <Text style={styles.cardItem}>
                بیشترین تب این دوره:{" "}
                {Math.max(...samples.map((s) => s.tempC)).toFixed(1)}°C
              </Text>
            )}

            <View style={styles.row}>
              {!isRunning ? (
                <Pressable style={[styles.primaryButton, styles.halfButton]} onPress={startMonitoring}>
                  <Text style={styles.primaryButtonText}>شروع اندازه‌گیری</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    style={[styles.secondaryButton, styles.halfButton]}
                    onPress={() => setEventModalVisible(true)}
                  >
                    <Text style={styles.secondaryButtonText}>ثبت رویداد</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.logoutButton, styles.halfButton]}
                    onPress={() => setStopModalVisible(true)}
                  >
                    <Text style={styles.logoutText}>خاتمه اندازه‌گیری</Text>
                  </Pressable>
                </>
              )}
            </View>

            {events.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>رویدادهای ثبت‌شده</Text>
                {events.map((e) => (
                  <Text key={e.id} style={styles.cardItem}>
                    {e.eventType === "sponge" ? "پاشویه" : `دارو: ${e.medicineName} (${e.medicineDose})`} -{" "}
                    {formatDateTime(e.eventAt)}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={eventModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>ثبت رویداد درمانی</Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.tag, eventType === "sponge" && styles.tagActive]}
                onPress={() => setEventType("sponge")}
              >
                <Text style={eventType === "sponge" ? styles.tagTextActive : styles.tagText}>پاشویه</Text>
              </Pressable>
              <Pressable
                style={[styles.tag, eventType === "medicine" && styles.tagActive]}
                onPress={() => setEventType("medicine")}
              >
                <Text style={eventType === "medicine" ? styles.tagTextActive : styles.tagText}>دادن دارو</Text>
              </Pressable>
            </View>
            {eventType === "medicine" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="نام دارو"
                  value={medicineName}
                  onChangeText={setMedicineName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="دوز مصرف"
                  value={medicineDose}
                  onChangeText={setMedicineDose}
                />
              </>
            )}
            <TextInput
              style={styles.input}
              placeholder="توضیح (اختیاری)"
              value={eventNote}
              onChangeText={setEventNote}
            />
            <View style={styles.row}>
              <Pressable style={[styles.secondaryButton, styles.halfButton]} onPress={() => setEventModalVisible(false)}>
                <Text style={styles.secondaryButtonText}>انصراف</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, styles.halfButton]} onPress={addEvent}>
                <Text style={styles.primaryButtonText}>ذخیره رویداد</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={stopModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>توقف پایش تب</Text>
            <Text style={styles.cardItem}>آیا مطمئن هستید که می‌خواهید پایش تب را متوقف کنید؟</Text>
            <TextInput
              style={styles.input}
              placeholder="عنوان بیماری / وضعیت"
              value={diseaseLabel}
              onChangeText={setDiseaseLabel}
            />
            {lastSessionForChild?.diseaseLabel && (
              <Text style={styles.mutedText}>آخرین عنوان ثبت‌شده: {lastSessionForChild.diseaseLabel}</Text>
            )}
            <View style={styles.row}>
              <Pressable
                style={[styles.secondaryButton, styles.halfButton]}
                onPress={() => setStopModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>خیر</Text>
              </Pressable>
              <Pressable style={[styles.logoutButton, styles.halfButton]} onPress={stopAndSave}>
                <Text style={styles.logoutText}>بله، توقف و ذخیره</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FeverHistoryScreen({
  children,
  sessions,
}: {
  children: ChildProfile[];
  sessions: FeverSession[];
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(children[0]?.id ?? null);
  const [diseaseFilter, setDiseaseFilter] = useState("");

  const filtered = useMemo(() => {
    let result = [...sessions].sort((a, b) => +new Date(b.endedAt) - +new Date(a.endedAt));
    if (selectedChildId) {
      result = result.filter((s) => s.childId === selectedChildId);
    }
    if (diseaseFilter.trim()) {
      result = result.filter((s) =>
        s.diseaseLabel.toLowerCase().includes(diseaseFilter.trim().toLowerCase()),
      );
    }
    return result;
  }, [sessions, selectedChildId, diseaseFilter]);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <Text style={styles.sectionTitle}>فیلتر سوابق</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
          <Pressable
            style={[styles.tag, selectedChildId === null && styles.tagActive]}
            onPress={() => setSelectedChildId(null)}
          >
            <Text style={selectedChildId === null ? styles.tagTextActive : styles.tagText}>همه</Text>
          </Pressable>
          {children.map((child) => (
            <Pressable
              key={child.id}
              style={[styles.tag, selectedChildId === child.id && styles.tagActive]}
              onPress={() => setSelectedChildId(child.id)}
            >
              <Text style={selectedChildId === child.id ? styles.tagTextActive : styles.tagText}>
                {child.firstName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <TextInput
          style={styles.input}
          placeholder="جستجو بر اساس نام بیماری"
          value={diseaseFilter}
          onChangeText={setDiseaseFilter}
        />

        <Text style={styles.sectionTitle}>سوابق تب</Text>
        {filtered.length === 0 ? (
          <Text style={styles.mutedText}>سابقه‌ای برای نمایش وجود ندارد.</Text>
        ) : (
          filtered.map((session) => {
            const child = children.find((c) => c.id === session.childId);
            return (
              <View key={session.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {child?.firstName ?? "کودک نامشخص"} - {session.diseaseLabel}
                </Text>
                <Text style={styles.cardItem}>شروع: {formatDateTime(session.startedAt)}</Text>
                <Text style={styles.cardItem}>پایان: {formatDateTime(session.endedAt)}</Text>
                <Text style={styles.cardItem}>بیشترین تب: {session.peakTempC.toFixed(1)}°C</Text>
                <Text style={styles.cardItem}>تعداد نمونه: {session.samples.length}</Text>
                <Text style={styles.cardItem}>رویداد درمانی: {session.events.length}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function JaundiceScreen({
  children,
  tests,
  onSaveTest,
}: {
  children: ChildProfile[];
  tests: JaundiceTest[];
  onSaveTest: (test: JaundiceTest) => void;
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(children[0]?.id ?? null);
  const [captures, setCaptures] = useState<JaundiceCapture[]>([]);
  const [roiModalVisible, setRoiModalVisible] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [roiNote, setRoiNote] = useState("کالیبراتور در مرکز تصویر");
  const [analyzing, setAnalyzing] = useState(false);
  const [latestResult, setLatestResult] = useState<JaundiceTest | null>(null);

  const requiredShots = 4;
  const nextShotIndex = captures.length + 1;

  const captureImage = async () => {
    if (!selectedChildId) {
      Alert.alert("انتخاب کودک", "لطفا ابتدا کودک را انتخاب کنید.");
      return;
    }
    if (captures.length >= requiredShots) {
      Alert.alert("کامل شده", "چهار تصویر لازم ثبت شده است.");
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("دسترسی دوربین", "برای ثبت تصویر، دسترسی دوربین لازم است.");
      return;
    }
    const image = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.5,
    });
    if (image.canceled || !image.assets[0]) {
      return;
    }
    setPendingUri(image.assets[0].uri);
    setRoiNote("کالیبراتور در مرکز تصویر");
    setRoiModalVisible(true);
  };

  const confirmRoi = () => {
    if (!pendingUri) {
      return;
    }
    const capture: JaundiceCapture = {
      id: uuid(),
      uri: pendingUri,
      isFlash: captures.length < 2,
      roiNote: roiNote.trim() || "ROI ثبت شد",
      capturedAt: new Date().toISOString(),
    };
    setCaptures((prev) => [...prev, capture]);
    setPendingUri(null);
    setRoiModalVisible(false);
  };

  const submitForAnalysis = () => {
    if (!selectedChildId) {
      Alert.alert("انتخاب کودک", "لطفا ابتدا کودک را انتخاب کنید.");
      return;
    }
    if (captures.length < requiredShots) {
      Alert.alert("تصاویر ناکافی", "برای سنجش زردی باید ۴ تصویر ثبت شود.");
      return;
    }
    setAnalyzing(true);
    setTimeout(() => {
      const base = 8 + Math.random() * 10;
      const level = Math.round(base * 100) / 100;
      const recommendation = recommendationForJaundice(level);
      const test: JaundiceTest = {
        id: uuid(),
        childId: selectedChildId,
        captures,
        estimatedLevel: level,
        recommendation,
        createdAt: new Date().toISOString(),
      };
      onSaveTest(test);
      setLatestResult(test);
      setCaptures([]);
      setAnalyzing(false);
    }, 1800);
  };

  const childTests = selectedChildId ? tests.filter((t) => t.childId === selectedChildId) : [];

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        {children.length === 0 ? (
          <Text style={styles.mutedText}>ابتدا کودک را ثبت کنید.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>انتخاب کودک</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
              {children.map((child) => (
                <Pressable
                  key={child.id}
                  style={[styles.tag, selectedChildId === child.id && styles.tagActive]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={selectedChildId === child.id ? styles.tagTextActive : styles.tagText}>
                    {child.firstName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>راهنمای تصویربرداری</Text>
              <Text style={styles.cardItem}>1) کالیبراتور را روی سینه نوزاد قرار دهید.</Text>
              <Text style={styles.cardItem}>2) 2 تصویر با فلش و 2 تصویر بدون فلش ثبت کنید.</Text>
              <Text style={styles.cardItem}>3) بعد از هر عکس، محدوده کالیبراتور را تایید کنید.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>سنجش جدید</Text>
              <Text style={styles.cardItem}>تعداد تصاویر ثبت‌شده: {captures.length} / 4</Text>
              <Text style={styles.cardItem}>
                عکس بعدی: {nextShotIndex <= 4 ? `${nextShotIndex} (${nextShotIndex <= 2 ? "با فلش" : "بدون فلش"})` : "تکمیل شده"}
              </Text>
              <Pressable style={styles.secondaryButton} onPress={captureImage}>
                <Text style={styles.secondaryButtonText}>ثبت تصویر</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, analyzing && styles.disabledButton]}
                onPress={submitForAnalysis}
                disabled={analyzing}
              >
                <Text style={styles.primaryButtonText}>
                  {analyzing ? "در حال تحلیل هوش مصنوعی..." : "ارسال برای تحلیل AI"}
                </Text>
              </Pressable>
            </View>

            {latestResult && (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>
                  نتیجه آخر: {latestResult.estimatedLevel.toFixed(2)} - {latestResult.recommendation}
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>سوابق زردی کودک</Text>
            {childTests.length === 0 ? (
              <Text style={styles.mutedText}>سابقه‌ای ثبت نشده است.</Text>
            ) : (
              childTests
                .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                .map((test) => (
                  <View key={test.id} style={styles.card}>
                    <Text style={styles.cardTitle}>مقدار زردی: {test.estimatedLevel.toFixed(2)}</Text>
                    <Text style={styles.cardItem}>زمان: {formatDateTime(test.createdAt)}</Text>
                    <Text style={styles.cardItem}>توصیه: {test.recommendation}</Text>
                  </View>
                ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={roiModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>تایید محدوده کالیبراتور</Text>
            <Text style={styles.cardItem}>
              بعد از هر عکس، محدوده کالیبراتور را مشخص کنید (نسخه MVP: توضیح متنی ROI).
            </Text>
            <TextInput style={styles.input} value={roiNote} onChangeText={setRoiNote} />
            <View style={styles.row}>
              <Pressable
                style={[styles.secondaryButton, styles.halfButton]}
                onPress={() => setRoiModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>انصراف</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, styles.halfButton]} onPress={confirmRoi}>
                <Text style={styles.primaryButtonText}>تایید و ادامه</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function VaccinationScreen({
  children,
  records,
  onRegisterVaccine,
}: {
  children: ChildProfile[];
  records: VaccinationRecord[];
  onRegisterVaccine: (record: VaccinationRecord) => void;
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(children[0]?.id ?? null);
  const [selectedSideEffects, setSelectedSideEffects] = useState<string[]>([]);
  const sideEffects = ["تب", "بی‌قراری", "قرمزی محل تزریق"];

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const childAge = selectedChild ? ageMonthsFromBirthDate(selectedChild.birthDate) : 0;

  const childRecords = records.filter((r) => r.childId === selectedChildId);
  const schedule = vaccineCatalog.map((item) => {
    const doneRecord = childRecords.find(
      (r) => r.vaccineName === item.name && r.recommendedAgeMonths === item.ageMonths,
    );
    const status = doneRecord ? "done" : childAge > item.ageMonths + 1 ? "overdue" : "pending";
    return { ...item, status, doneRecord };
  });
  const overdueCount = schedule.filter((s) => s.status === "overdue").length;
  const nearest = schedule.find((s) => s.status !== "done");

  const register = (item: (typeof vaccineCatalog)[number]) => {
    if (!selectedChildId) {
      return;
    }
    onRegisterVaccine({
      id: uuid(),
      childId: selectedChildId,
      vaccineName: item.name,
      recommendedAgeMonths: item.ageMonths,
      injectionDate: new Date().toISOString().slice(0, 10),
      sideEffects: selectedSideEffects,
    });
    setSelectedSideEffects([]);
  };

  const toggleSideEffect = (value: string) => {
    setSelectedSideEffects((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  };

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        {children.length === 0 ? (
          <Text style={styles.mutedText}>ابتدا کودک را در بخش مدیریت کودکان ثبت کنید.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>انتخاب کودک</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
              {children.map((child) => (
                <Pressable
                  key={child.id}
                  style={[styles.tag, selectedChildId === child.id && styles.tagActive]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={selectedChildId === child.id ? styles.tagTextActive : styles.tagText}>
                    {child.firstName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>وضعیت کلی واکسیناسیون</Text>
              <Text style={styles.cardItem}>
                {overdueCount === 0 ? "به‌روز ✅" : `دارای تاخیر ⚠️ (${overdueCount} مورد)`}
              </Text>
              <Text style={styles.cardItem}>
                نزدیک‌ترین واکسن: {nearest ? nearest.name : "همه واکسن‌ها ثبت شده"}
              </Text>
            </View>

            <Text style={styles.label}>عوارض احتمالی تزریق (اختیاری)</Text>
            <View style={styles.rowWrap}>
              {sideEffects.map((effect) => (
                <Pressable
                  key={effect}
                  style={[styles.tag, selectedSideEffects.includes(effect) && styles.tagActive]}
                  onPress={() => toggleSideEffect(effect)}
                >
                  <Text style={selectedSideEffects.includes(effect) ? styles.tagTextActive : styles.tagText}>
                    {effect}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>جدول واکسن‌ها</Text>
            {schedule.map((item) => (
              <View key={item.name} style={styles.card}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardItem}>سن توصیه‌شده: {item.ageMonths} ماهگی</Text>
                <Text
                  style={[
                    styles.cardItem,
                    item.status === "done"
                      ? styles.statusDone
                      : item.status === "overdue"
                        ? styles.statusOverdue
                        : styles.statusPending,
                  ]}
                >
                  وضعیت:{" "}
                  {item.status === "done" ? "انجام شده" : item.status === "overdue" ? "عقب افتاده" : "در انتظار"}
                </Text>
                <Text style={styles.cardItem}>
                  تاریخ تزریق: {item.doneRecord ? formatDateOnly(item.doneRecord.injectionDate) : "-"}
                </Text>
                {item.status !== "done" && (
                  <Pressable style={styles.inlineButton} onPress={() => register(item)}>
                    <Text style={styles.inlineButtonText}>ثبت تزریق</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function GrowthScreen({
  children,
  records,
  onAddRecord,
}: {
  children: ChildProfile[];
  records: GrowthRecord[];
  onAddRecord: (record: GrowthRecord) => void;
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(children[0]?.id ?? null);
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [headCm, setHeadCm] = useState("");

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const childRecords = records
    .filter((r) => r.childId === selectedChildId)
    .sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt));

  const add = () => {
    if (!selectedChildId) {
      Alert.alert("انتخاب کودک", "لطفا ابتدا کودک را انتخاب کنید.");
      return;
    }
    if (!weightKg && !heightCm && !headCm) {
      Alert.alert("ورودی", "حداقل یکی از شاخص‌ها را وارد کنید.");
      return;
    }
    onAddRecord({
      id: uuid(),
      childId: selectedChildId,
      measuredAt: new Date().toISOString(),
      weightKg: weightKg.trim(),
      heightCm: heightCm.trim(),
      headCircumferenceCm: headCm.trim(),
    });
    setWeightKg("");
    setHeightCm("");
    setHeadCm("");
  };

  const growthStatus = useMemo(() => {
    if (!childRecords.length) {
      return "اطلاعات کافی برای تحلیل وجود ندارد";
    }
    const latest = childRecords[0];
    const weight = Number(latest.weightKg);
    if (Number.isNaN(weight)) {
      return "اطلاعات کافی برای تحلیل وجود ندارد";
    }
    if (weight < 2 || weight > 30) {
      return "نیاز به توجه";
    }
    return "طبیعی";
  }, [childRecords]);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        {children.length === 0 ? (
          <Text style={styles.mutedText}>ابتدا کودک را ثبت کنید.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>انتخاب کودک</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
              {children.map((child) => (
                <Pressable
                  key={child.id}
                  style={[styles.tag, selectedChildId === child.id && styles.tagActive]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={selectedChildId === child.id ? styles.tagTextActive : styles.tagText}>
                    {child.firstName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>نمای کلی رشد</Text>
              <Text style={styles.cardItem}>
                کودک: {selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : "-"}
              </Text>
              <Text style={styles.cardItem}>وضعیت فعلی: {growthStatus}</Text>
            </View>

            <Text style={styles.sectionTitle}>ثبت اندازه‌گیری جدید</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.thirdInput]}
                placeholder="وزن (kg)"
                keyboardType="decimal-pad"
                value={weightKg}
                onChangeText={setWeightKg}
              />
              <TextInput
                style={[styles.input, styles.thirdInput]}
                placeholder="قد (cm)"
                keyboardType="decimal-pad"
                value={heightCm}
                onChangeText={setHeightCm}
              />
              <TextInput
                style={[styles.input, styles.thirdInput]}
                placeholder="دور سر (cm)"
                keyboardType="decimal-pad"
                value={headCm}
                onChangeText={setHeadCm}
              />
            </View>
            <Pressable style={styles.primaryButton} onPress={add}>
              <Text style={styles.primaryButtonText}>ذخیره اندازه‌گیری</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>سوابق رشد جسمی</Text>
            {childRecords.length === 0 ? (
              <Text style={styles.mutedText}>هیچ اندازه‌گیری ثبت نشده است.</Text>
            ) : (
              childRecords.map((r) => (
                <View key={r.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{formatDateTime(r.measuredAt)}</Text>
                  <Text style={styles.cardItem}>وزن: {r.weightKg || "-"}</Text>
                  <Text style={styles.cardItem}>قد/طول: {r.heightCm || "-"}</Text>
                  <Text style={styles.cardItem}>دور سر: {r.headCircumferenceCm || "-"}</Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConsultationScreen({
  children,
  consultations,
  onCreate,
  onUpdate,
}: {
  children: ChildProfile[];
  consultations: ConsultationThread[];
  onCreate: (consultation: ConsultationThread) => void;
  onUpdate: (consultationId: string, updater: (thread: ConsultationThread) => ConsultationThread) => void;
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(children[0]?.id ?? null);
  const [selectedDoctorName, setSelectedDoctorName] = useState(doctorDirectory[0].name);
  const [summaryItems, setSummaryItems] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [activeConsultationId, setActiveConsultationId] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");

  const summaryOptions = [
    "سابقه تب 24 ساعت گذشته",
    "نمودار زردی 3 روز گذشته",
    "نمودار رشد جسمی",
    "خلاصه رشد حسی-حرکتی",
    "خلاصه تکامل کودک",
  ];

  const activeConsultation = consultations.find((c) => c.id === activeConsultationId) ?? null;

  const toggleSummaryItem = (item: string) => {
    setSummaryItems((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  };

  const createConsultation = () => {
    if (!selectedChildId) {
      Alert.alert("انتخاب کودک", "لطفا کودک را انتخاب کنید.");
      return;
    }
    const doctor = doctorDirectory.find((d) => d.name === selectedDoctorName);
    if (!doctor) {
      return;
    }
    const consultation: ConsultationThread = {
      id: uuid(),
      childId: selectedChildId,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      feeAmount: doctor.fee,
      paymentStatus: "pending",
      status: "awaiting_payment",
      summaryItems,
      messages: messageText.trim()
        ? [
            {
              id: uuid(),
              senderRole: "parent",
              text: messageText.trim(),
              sentAt: new Date().toISOString(),
            },
          ]
        : [],
      createdAt: new Date().toISOString(),
    };
    onCreate(consultation);
    setActiveConsultationId(consultation.id);
    setMessageText("");
    setSummaryItems([]);
  };

  const payConsultation = (consultationId: string) => {
    onUpdate(consultationId, (thread) => ({
      ...thread,
      paymentStatus: "paid",
      status: "active",
      messages: [
        ...thread.messages,
        {
          id: uuid(),
          senderRole: "doctor",
          text: "پرداخت شما تایید شد. لطفا سوال خود را کامل بفرمایید.",
          sentAt: new Date().toISOString(),
        },
      ],
    }));
  };

  const sendChat = () => {
    if (!activeConsultation || !chatText.trim()) {
      return;
    }
    const message = chatText.trim();
    setChatText("");
    onUpdate(activeConsultation.id, (thread) => ({
      ...thread,
      messages: [
        ...thread.messages,
        {
          id: uuid(),
          senderRole: "parent",
          text: message,
          sentAt: new Date().toISOString(),
        },
      ],
    }));
    setTimeout(() => {
      onUpdate(activeConsultation.id, (thread) => ({
        ...thread,
        messages: [
          ...thread.messages,
          {
            id: uuid(),
            senderRole: "doctor",
            text: "پیام شما دریافت شد. با توجه به علائم، پایش را ادامه دهید و اگر تب بالاتر رفت مراجعه کنید.",
            sentAt: new Date().toISOString(),
          },
        ],
      }));
    }, 1200);
  };

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        {children.length === 0 ? (
          <Text style={styles.mutedText}>ابتدا کودک را ثبت کنید.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>درخواست مشاوره جدید</Text>
            <Text style={styles.label}>انتخاب کودک</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
              {children.map((child) => (
                <Pressable
                  key={child.id}
                  style={[styles.tag, selectedChildId === child.id && styles.tagActive]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={selectedChildId === child.id ? styles.tagTextActive : styles.tagText}>
                    {child.firstName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>پزشک</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
              {doctorDirectory.map((doc) => (
                <Pressable
                  key={doc.name}
                  style={[styles.tag, selectedDoctorName === doc.name && styles.tagActive]}
                  onPress={() => setSelectedDoctorName(doc.name)}
                >
                  <Text style={selectedDoctorName === doc.name ? styles.tagTextActive : styles.tagText}>
                    {doc.name} ({doc.rating})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>الحاق خلاصه وضعیت</Text>
            <View style={styles.rowWrap}>
              {summaryOptions.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.tag, summaryItems.includes(item) && styles.tagActive]}
                  onPress={() => toggleSummaryItem(item)}
                >
                  <Text style={summaryItems.includes(item) ? styles.tagTextActive : styles.tagText}>{item}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="پیام متنی برای پزشک"
              value={messageText}
              onChangeText={setMessageText}
            />

            <Pressable style={styles.primaryButton} onPress={createConsultation}>
              <Text style={styles.primaryButtonText}>ایجاد درخواست مشاوره</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>درخواست‌ها</Text>
            {consultations.length === 0 ? (
              <Text style={styles.mutedText}>درخواستی ثبت نشده است.</Text>
            ) : (
              consultations.map((c) => (
                <View key={c.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{c.doctorName}</Text>
                  <Text style={styles.cardItem}>تخصص: {c.specialty}</Text>
                  <Text style={styles.cardItem}>تعرفه: {c.feeAmount.toLocaleString("fa-IR")} ریال</Text>
                  <Text style={styles.cardItem}>
                    وضعیت: {c.status === "awaiting_payment" ? "در انتظار پرداخت" : c.status === "active" ? "فعال" : "بسته"}
                  </Text>
                  {c.status === "awaiting_payment" && (
                    <Pressable style={styles.inlineButton} onPress={() => payConsultation(c.id)}>
                      <Text style={styles.inlineButtonText}>پرداخت و فعال‌سازی چت</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.secondaryButton} onPress={() => setActiveConsultationId(c.id)}>
                    <Text style={styles.secondaryButtonText}>مشاهده/ارسال پیام</Text>
                  </Pressable>
                </View>
              ))
            )}

            {activeConsultation && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>چت با {activeConsultation.doctorName}</Text>
                <View style={{ maxHeight: 250 }}>
                  <ScrollView>
                    {activeConsultation.messages.map((m) => (
                      <View
                        key={m.id}
                        style={[
                          styles.chatBubble,
                          m.senderRole === "parent" ? styles.chatParent : styles.chatDoctor,
                        ]}
                      >
                        <Text style={styles.chatText}>{m.text}</Text>
                        <Text style={styles.chatMeta}>{formatDateTime(m.sentAt)}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
                {activeConsultation.status === "active" ? (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="پیام شما"
                      value={chatText}
                      onChangeText={setChatText}
                    />
                    <Pressable style={styles.primaryButton} onPress={sendChat}>
                      <Text style={styles.primaryButtonText}>ارسال پیام</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.mutedText}>برای فعال شدن چت، ابتدا پرداخت را انجام دهید.</Text>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RemoteMonitoringScreen({
  children,
  sessions,
  messages,
  onAddMessage,
}: {
  children: ChildProfile[];
  sessions: FeverSession[];
  messages: RemoteMessage[];
  onAddMessage: (msg: RemoteMessage) => void;
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(children[0]?.id ?? null);
  const [text, setText] = useState("");

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const today = new Date().toISOString().slice(0, 10);
  const childSessions = sessions.filter((s) => s.childId === selectedChildId);
  const maxToday = childSessions
    .filter((s) => s.endedAt.slice(0, 10) === today)
    .reduce((max, s) => Math.max(max, s.peakTempC), 0);
  const latestSession = [...childSessions].sort((a, b) => +new Date(b.endedAt) - +new Date(a.endedAt))[0];
  const childMessages = messages
    .filter((m) => m.childId === selectedChildId)
    .sort((a, b) => +new Date(a.sentAt) - +new Date(b.sentAt));

  const send = () => {
    if (!selectedChildId || !text.trim()) {
      return;
    }
    const msg: RemoteMessage = {
      id: uuid(),
      childId: selectedChildId,
      sender: "parent",
      text: text.trim(),
      sentAt: new Date().toISOString(),
    };
    onAddMessage(msg);
    setText("");
    setTimeout(() => {
      onAddMessage({
        id: uuid(),
        childId: selectedChildId,
        sender: "caregiver",
        text: "پیام دریافت شد. وضعیت کودک پایدار است و پایش ادامه دارد.",
        sentAt: new Date().toISOString(),
      });
    }, 1300);
  };

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        {children.length === 0 ? (
          <Text style={styles.mutedText}>ابتدا کودک را ثبت کنید.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>انتخاب کودک</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList}>
              {children.map((child) => (
                <Pressable
                  key={child.id}
                  style={[styles.tag, selectedChildId === child.id && styles.tagActive]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={selectedChildId === child.id ? styles.tagTextActive : styles.tagText}>
                    {child.firstName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>وضعیت پایش از راه دور</Text>
              <Text style={styles.cardItem}>
                کودک: {selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : "-"}
              </Text>
              <Text style={styles.cardItem}>
                حداکثر دمای امروز: {maxToday > 0 ? `${maxToday.toFixed(1)}°C` : "ثبت نشده"}
              </Text>
              <Text style={styles.cardItem}>
                آخرین پایش: {latestSession ? formatDateTime(latestSession.endedAt) : "ندارد"}
              </Text>
            </View>

            {latestSession && latestSession.events.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>اقدامات مربی در پایش اخیر</Text>
                {latestSession.events.map((e) => (
                  <Text key={e.id} style={styles.cardItem}>
                    {e.eventType === "sponge" ? "پاشویه" : `دارو: ${e.medicineName} (${e.medicineDose})`}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>پیام با مربی</Text>
              <View style={{ maxHeight: 220 }}>
                <ScrollView>
                  {childMessages.map((m) => (
                    <View
                      key={m.id}
                      style={[
                        styles.chatBubble,
                        m.sender === "parent" ? styles.chatParent : styles.chatDoctor,
                      ]}
                    >
                      <Text style={styles.chatText}>{m.text}</Text>
                      <Text style={styles.chatMeta}>{formatDateTime(m.sentAt)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
              <TextInput style={styles.input} placeholder="پیام برای مربی" value={text} onChangeText={setText} />
              <Pressable style={styles.primaryButton} onPress={send}>
                <Text style={styles.primaryButtonText}>ارسال پیام</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsScreen({
  settings,
  onUpdateSettings,
  onChangePassword,
}: {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onChangePassword: (oldPassword: string, newPassword: string) => boolean;
}) {
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");

  const toggleNotifications = () => {
    onUpdateSettings({
      ...settings,
      notificationsEnabled: !settings.notificationsEnabled,
    });
  };

  const setChannel = (channel: "push" | "sms") => {
    onUpdateSettings({
      ...settings,
      notificationChannel: channel,
    });
  };

  const changePassword = () => {
    if (!oldPass || !newPass) {
      Alert.alert("ورودی ناقص", "رمز قبلی و جدید را وارد کنید.");
      return;
    }
    if (newPass.length < 4) {
      Alert.alert("رمز ضعیف", "رمز جدید باید حداقل ۴ کاراکتر باشد.");
      return;
    }
    const ok = onChangePassword(oldPass, newPass);
    if (ok) {
      Alert.alert("موفق", "رمز عبور با موفقیت تغییر یافت.");
      setOldPass("");
      setNewPass("");
    }
  };

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>یادآوری‌ها</Text>
          <Text style={styles.cardItem}>
            اعلان‌ها: {settings.notificationsEnabled ? "روشن" : "خاموش"}
          </Text>
          <Pressable style={styles.secondaryButton} onPress={toggleNotifications}>
            <Text style={styles.secondaryButtonText}>
              {settings.notificationsEnabled ? "خاموش کردن اعلان‌ها" : "روشن کردن اعلان‌ها"}
            </Text>
          </Pressable>
          <Text style={styles.cardItem}>کانال فعلی: {settings.notificationChannel === "push" ? "نوتیفیکیشن" : "پیامک"}</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.tag, settings.notificationChannel === "push" && styles.tagActive]}
              onPress={() => setChannel("push")}
            >
              <Text style={settings.notificationChannel === "push" ? styles.tagTextActive : styles.tagText}>
                نوتیفیکیشن
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tag, settings.notificationChannel === "sms" && styles.tagActive]}
              onPress={() => setChannel("sms")}
            >
              <Text style={settings.notificationChannel === "sms" ? styles.tagTextActive : styles.tagText}>
                پیامک
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>تغییر رمز عبور</Text>
          <TextInput
            style={styles.input}
            placeholder="رمز فعلی"
            secureTextEntry
            value={oldPass}
            onChangeText={setOldPass}
          />
          <TextInput
            style={styles.input}
            placeholder="رمز جدید"
            secureTextEntry
            value={newPass}
            onChangeText={setNewPass}
          />
          <Pressable style={styles.primaryButton} onPress={changePassword}>
            <Text style={styles.primaryButtonText}>ثبت تغییر رمز</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default App;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f9fc",
  },
  authContainer: {
    flex: 1,
    backgroundColor: "#f7f9fc",
  },
  authScroll: {
    padding: 20,
    paddingTop: 60,
  },
  authTitle: {
    fontSize: 36,
    fontWeight: "700",
    color: "#0b84ff",
    marginBottom: 8,
    textAlign: "center",
  },
  authSubtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#4f5b67",
    marginBottom: 20,
  },
  page: {
    flex: 1,
    backgroundColor: "#f7f9fc",
  },
  pageContent: {
    padding: 16,
    paddingBottom: 36,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#18263a",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginVertical: 10,
    color: "#1d2e44",
  },
  label: {
    marginTop: 8,
    marginBottom: 6,
    color: "#34495e",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e4ebf3",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    color: "#1d2e44",
  },
  cardItem: {
    fontSize: 14,
    color: "#32465a",
    marginBottom: 4,
  },
  noticeCard: {
    backgroundColor: "#eaf4ff",
    borderColor: "#b6daff",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  noticeText: {
    color: "#114a8b",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe5f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  moduleButton: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe5f0",
    padding: 12,
  },
  moduleText: {
    color: "#1d2e44",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#0b84ff",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#0b84ff",
  },
  secondaryButtonText: {
    color: "#0b84ff",
    fontWeight: "700",
  },
  logoutButton: {
    backgroundColor: "#fff1f0",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffb4ae",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  logoutText: {
    color: "#d63f32",
    fontWeight: "700",
  },
  mutedText: {
    color: "#6d7c8b",
    marginTop: 8,
    marginBottom: 8,
    lineHeight: 20,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dbe5f0",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  modeButtonActive: {
    backgroundColor: "#0b84ff",
    borderColor: "#0b84ff",
  },
  modeText: {
    color: "#1d2e44",
    fontWeight: "600",
  },
  modeTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  tag: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#dbe5f0",
    borderRadius: 30,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  tagActive: {
    backgroundColor: "#0b84ff",
    borderColor: "#0b84ff",
  },
  tagText: {
    color: "#2c3e50",
    fontWeight: "600",
  },
  tagTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  inlineButton: {
    alignSelf: "flex-start",
    backgroundColor: "#f0f7ff",
    borderColor: "#b6daff",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 6,
  },
  inlineButtonText: {
    color: "#0b84ff",
    fontWeight: "700",
  },
  halfInput: {
    flex: 1,
  },
  thirdInput: {
    flex: 1,
    marginBottom: 0,
  },
  halfButton: {
    flex: 1,
  },
  horizontalList: {
    marginBottom: 8,
  },
  bigTemp: {
    fontSize: 44,
    fontWeight: "800",
    color: "#0b84ff",
    textAlign: "center",
    marginVertical: 8,
  },
  chartWrapper: {
    marginBottom: 10,
  },
  chartStyle: {
    borderRadius: 12,
    marginVertical: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
  },
  statusDone: {
    color: "#1f9d55",
    fontWeight: "700",
  },
  statusPending: {
    color: "#4f5b67",
    fontWeight: "700",
  },
  statusOverdue: {
    color: "#d97706",
    fontWeight: "700",
  },
  chatBubble: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    maxWidth: "90%",
  },
  chatParent: {
    alignSelf: "flex-end",
    backgroundColor: "#d7ebff",
  },
  chatDoctor: {
    alignSelf: "flex-start",
    backgroundColor: "#eef2f7",
  },
  chatText: {
    color: "#1d2e44",
    marginBottom: 4,
  },
  chatMeta: {
    fontSize: 11,
    color: "#6d7c8b",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
