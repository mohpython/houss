package com.sahasantemali.saha_sante

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Arrays

class MainActivity : FlutterActivity() {
    companion object {
        private const val CHANNEL = "com.sahasantemali.saha_sante/sms_otp"
        private const val SMS_CONSENT_REQUEST = 2048
        private val OTP_REGEX = Regex("\\b(\\d{6})\\b")
    }

    private var methodChannel: MethodChannel? = null
    private var smsReceiver: BroadcastReceiver? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
        methodChannel = channel
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "getAppHash" -> result.success(computeAppHash())
                "startListening" -> {
                    startSmsListening()
                    result.success(true)
                }
                "stopListening" -> {
                    unregisterSmsReceiver()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun startSmsListening() {
        unregisterSmsReceiver()
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
                val extras = intent.extras ?: return
                val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
                if (status.statusCode != CommonStatusCodes.SUCCESS) return

                // 1) Mode 0-clic (SMS Retriever avec hash 11 caractères)
                val directMessage = extras.getString(SmsRetriever.EXTRA_SMS_MESSAGE)
                if (!directMessage.isNullOrEmpty()) {
                    deliverOtpFromMessage(directMessage)
                    return
                }

                // 2) Mode secours 1-clic (SMS User Consent si hash différent)
                @Suppress("DEPRECATION")
                val consentIntent = extras.getParcelable<Intent>(SmsRetriever.EXTRA_CONSENT_INTENT)
                if (consentIntent != null) {
                    try {
                        startActivityForResult(consentIntent, SMS_CONSENT_REQUEST)
                    } catch (_: Exception) {
                    }
                }
            }
        }
        smsReceiver = receiver
        val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
        ContextCompat.registerReceiver(
            this,
            receiver,
            filter,
            SmsRetriever.SEND_PERMISSION,
            null,
            ContextCompat.RECEIVER_EXPORTED
        )

        val client = SmsRetriever.getClient(this)
        client.startSmsRetriever()
        client.startSmsUserConsent(null)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == SMS_CONSENT_REQUEST && resultCode == Activity.RESULT_OK && data != null) {
            val message = data.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE)
            if (!message.isNullOrEmpty()) {
                deliverOtpFromMessage(message)
            }
        }
    }

    private fun deliverOtpFromMessage(message: String) {
        val code = OTP_REGEX.find(message)?.groupValues?.getOrNull(1) ?: return
        runOnUiThread {
            methodChannel?.invokeMethod("onOtpReceived", code)
        }
        unregisterSmsReceiver()
    }

    private fun unregisterSmsReceiver() {
        val r = smsReceiver ?: return
        smsReceiver = null
        try {
            unregisterReceiver(r)
        } catch (_: Exception) {
        }
    }

    override fun onDestroy() {
        unregisterSmsReceiver()
        super.onDestroy()
    }

    private fun computeAppHash(): String {
        return try {
            val pkg = packageName
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = packageManager.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
                info.signingInfo?.apkContentsSigners
            } else {
                @Suppress("DEPRECATION")
                packageManager.getPackageInfo(pkg, PackageManager.GET_SIGNATURES).signatures
            }
            val certChars = signatures?.firstOrNull()?.toCharsString() ?: return "JUxjDqTvDuX"
            val appInfo = "$pkg $certChars"
            val digest = MessageDigest.getInstance("SHA-256")
            digest.update(appInfo.toByteArray(StandardCharsets.UTF_8))
            val hashSignature = Arrays.copyOfRange(digest.digest(), 0, 9)
            Base64.encodeToString(hashSignature, Base64.NO_PADDING or Base64.NO_WRAP).substring(0, 11)
        } catch (_: Exception) {
            "JUxjDqTvDuX"
        }
    }
}
