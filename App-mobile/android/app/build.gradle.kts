import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

// Signature de publication : clé de téléversement Play Store.
// Le mot de passe vit dans android/key.properties (gitignoré), jamais commité.
val keystoreProperties = Properties().apply {
    val ksFile = rootProject.file("key.properties")
    if (ksFile.exists()) {
        load(FileInputStream(ksFile))
    }
}

android {
    namespace = "com.sahasantemali.saha_sante"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // Obligatoire pour `flutter_local_notifications` (API Java 8+ sur Android ancien).
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.sahasantemali.saha_sante"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Deux variantes de l'application :
    //   patient  : SAHA Santé (grand public)
    //   pharmacy : SAHA Pharmacie (espace professionnel)
    //
    // Elles partagent le MÊME applicationId pour conserver Firebase
    // (google-services.json ne contient que ce package), les notifications
    // push et les liens profonds `sahasantemali://auth`. Seul le nom affiché
    // change ; le code Dart bascule via --dart-define=APP_VARIANT=pharmacy.
    flavorDimensions += "app"
    productFlavors {
        create("patient") {
            dimension = "app"
            applicationId = "com.sahasantemali.saha_sante"
            resValue("string", "app_name", "SAHA Santé")
        }
        create("pharmacy") {
            dimension = "app"
            applicationId = "com.sahasantemali.saha_sante"
            resValue("string", "app_name", "SAHA Pharmacie")
        }
    }

    signingConfigs {
        create("release") {
            if (keystoreProperties.containsKey("storeFile")) {
                storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            if (keystoreProperties.containsKey("storeFile")) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                // Sans key.properties (développement local) : clé debug, pour que
                // `flutter run --release` continue de fonctionner.
                // En production il faut toujours la clé release (Play Console).
                signingConfig = signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation("com.google.android.gms:play-services-auth-api-phone:18.0.2")
}
