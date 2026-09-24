package expo.modules.stillmediavault

import java.io.ByteArrayInputStream
import org.junit.Assert.*
import org.junit.Test

class ReminderMediaTest {
  @Test fun boundedStreamRejectsTrueSizeEvenWithoutProviderLength() {
    assertThrows(Exception::class.java) {
      readBounded(ByteArrayInputStream(ByteArray(MAX_AUDIO_BYTES + 1)), MAX_AUDIO_BYTES)
    }
    assertEquals(3, readBounded(ByteArrayInputStream(byteArrayOf(1, 2, 3)), 3).size)
  }

  @Test fun encodedLengthIsRejectedBeforeDecodeAndEncodingMustBeCanonical() {
    assertThrows(Exception::class.java) { decodeReminderBase64("A".repeat(5592409)) }
    assertThrows(Exception::class.java) { decodeReminderBase64("AQ==\n") }
    assertThrows(Exception::class.java) { decodeReminderBase64("AQ=A") }
    assertArrayEquals(byteArrayOf(1), decodeReminderBase64("AQ=="))
  }

  @Test fun imageMetadataAndActualHeaderMustAgreeWithinBounds() {
    val png = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    val image = inspectReminder(png, "image", "image/png") { _, _ -> MediaFacts("image/png", 64, 64, null, false) }
    assertEquals(64, image.width)
    assertThrows(Exception::class.java) {
      inspectReminder(png, "image", "image/png") { _, _ -> MediaFacts("image/png", 5000, 1, null, false) }
    }
    assertThrows(Exception::class.java) {
      inspectReminder(png, "image", "image/png") { _, _ -> MediaFacts("image/jpeg", 64, 64, null, false) }
    }
  }

  @Test fun audioDurationMimeAndVideoAreCheckedFromBytes() {
    val mp3 = byteArrayOf(0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0)
    assertEquals(1200, inspectReminder(mp3, "audio", "audio/mpeg") { _, _ ->
      MediaFacts("audio/mpeg", null, null, 1200, false)
    }.durationMs)
    for (facts in listOf(
      MediaFacts("audio/mpeg", null, null, 240001, false),
      MediaFacts("audio/mpeg", null, null, 0, false),
      MediaFacts("video/mp4", null, null, 1200, true),
    )) assertThrows(Exception::class.java) {
      inspectReminder(mp3, "audio", "audio/mpeg") { _, _ -> facts }
    }
  }

  @Test fun mp4WithoutProvenAacTrackIsRejected() {
    val mp4 = byteArrayOf(0, 0, 0, 12, 'f'.code.toByte(), 't'.code.toByte(),
      'y'.code.toByte(), 'p'.code.toByte(), 'M'.code.toByte(), '4'.code.toByte(),
      'A'.code.toByte(), ' '.code.toByte())
    assertThrows(Exception::class.java) {
      inspectReminder(mp4, "audio", "audio/mp4") { _, _ ->
        MediaFacts("audio/mp4", null, null, 1200, false)
      }
    }
    assertThrows(Exception::class.java) {
      inspectReminder(mp4, "audio", "audio/mp4") { _, _ ->
        MediaFacts("audio/mp4", null, null, 1200, false, audioTrackMime = "audio/opus")
      }
    }
    assertEquals("audio/mp4", inspectReminder(mp4, "audio", "audio/mp4") { _, _ ->
      MediaFacts("audio/mp4", null, null, 1200, false, audioTrackMime = "audio/mp4a-latm")
    }.mime)
  }
}
