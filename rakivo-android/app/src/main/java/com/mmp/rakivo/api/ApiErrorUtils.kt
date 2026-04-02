package com.mmp.rakivo.api

import com.google.gson.Gson
import com.mmp.rakivo.model.ApiResponse
import retrofit2.Response

fun Response<*>.backendErrorMessage(defaultMessage: String): String {
    val errorBody = errorBody()?.string().orEmpty()
    if (errorBody.isBlank()) return defaultMessage

    return runCatching {
        Gson().fromJson(errorBody, ApiResponse::class.java)?.error
    }.getOrNull()?.takeIf { it.isNotBlank() } ?: defaultMessage
}
