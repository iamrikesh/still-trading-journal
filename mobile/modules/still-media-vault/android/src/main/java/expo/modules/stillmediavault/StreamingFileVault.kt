package expo.modules.stillmediavault

import com.google.crypto.tink.StreamingAead
import java.io.File
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.InputStream
import java.io.OutputStream

/** Native-only owned files. Callers serialize access to this private directory. */
internal class OwnedFiles(private val root: File) {
  init {
    check(root.isDirectory && root.canonicalFile == root.absoluteFile)
  }

  fun validate(file: File) {
    require(file.name.matches(Regex("[a-z0-9-]+\\.(plain|cipher|keyset|staging\\.plain|pending\\.cipher|verify\\.plain|playback\\.plain)")))
    require(file.absoluteFile.parentFile == root.absoluteFile)
    require(file.canonicalFile == file.absoluteFile)
  }

  fun input(file: File, limit: Long) {
    validate(file)
    require(file.isFile && file.length() <= limit)
  }

  fun remove(file: File) {
    validate(file)
    check(!file.exists() || (file.isFile && file.delete()))
  }

  /** createNewFile is exclusive; only this serialized owner can subsequently open it. */
  fun writeNew(file: File, block: (FileOutputStream) -> Unit) {
    validate(file)
    check(file.createNewFile())
    var completed = false
    try {
      FileOutputStream(file).use { output ->
        block(output)
        output.flush()
        output.fd.sync()
      }
      completed = true
    } finally {
      // Never delete an existing destination: this scope only starts after create-new succeeded.
      if (!completed) remove(file)
    }
  }
}

internal class StreamingFileVault(root: File, private val streaming: StreamingAead) {
  private val files = OwnedFiles(root)

  @Synchronized fun encrypt(input: File, destination: File, context: ByteArray) {
    files.input(input, MAX_PLAINTEXT_BYTES)
    files.writeNew(destination) { output ->
      input.inputStream().use { source ->
        // Tink must finalize its last segment before fd.sync; keep the file descriptor open.
        streaming.newEncryptingStream(UnclosedOutput(output), context).use { encrypted ->
          copyBounded(source, encrypted, MAX_PLAINTEXT_BYTES)
        }
      }
    }
  }

  @Synchronized fun decrypt(input: File, destination: File, context: ByteArray) {
    files.input(input, MAX_CIPHERTEXT_BYTES)
    files.writeNew(destination) { output ->
      BoundedInput(input.inputStream(), MAX_CIPHERTEXT_BYTES).use { source ->
        streaming.newDecryptingStream(source, context).use { decrypted ->
          // EOF and close authenticate the complete stream before a usable path can return.
          copyBounded(decrypted, output, MAX_PLAINTEXT_BYTES)
        }
      }
    }
  }

  companion object {
    const val MAX_PLAINTEXT_BYTES = 4L * 1024 * 1024
    // AES256_GCM_HKDF_4KB overhead is under this allowance at the plaintext ceiling.
    const val MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 64 * 1024

    fun copyBounded(input: InputStream, output: OutputStream, limit: Long) {
      val buffer = ByteArray(8192)
      var total = 0L
      while (true) {
        val count = input.read(buffer)
        if (count == -1) break
        total += count
        require(total <= limit)
        output.write(buffer, 0, count)
      }
    }
  }

  private class UnclosedOutput(private val output: OutputStream) : OutputStream() {
    override fun write(value: Int) = output.write(value)
    override fun write(bytes: ByteArray, offset: Int, length: Int) = output.write(bytes, offset, length)
    override fun flush() = output.flush()
    override fun close() = output.flush()
  }

  private class BoundedInput(input: InputStream, private val limit: Long) : FilterInputStream(input) {
    private var total = 0L
    private fun count(amount: Int): Int {
      if (amount > 0) total += amount
      require(total <= limit)
      return amount
    }
    override fun read(): Int {
      val value = `in`.read()
      count(if (value < 0) 0 else 1)
      return value
    }
    override fun read(bytes: ByteArray, offset: Int, length: Int) = count(`in`.read(bytes, offset, length))
  }
}
