// Copyright (c) Just Eat, 2016. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

namespace JustEat.ApplePayJS;

using System;
using System.Diagnostics.CodeAnalysis;
using Azure.Identity;
using Microsoft.Extensions.Configuration;

internal static class WebApplicationBuilderExtensions
{
    public static WebApplicationBuilder TryConfigureAzureKeyVault(this WebApplicationBuilder builder)
    {
        if (TryGetVaultUri(builder.Configuration, out Uri? vaultUri))
        {
            builder.Configuration.AddAzureKeyVault(vaultUri, new ManagedIdentityCredential());
        }

        return builder;
    }

    private static bool TryGetVaultUri(IConfiguration configuration, [MaybeNullWhen(false)] out Uri? vaultUri)
    {
        string? vault = configuration["AzureKeyVault:Uri"];

        if (!string.IsNullOrEmpty(vault) && Uri.TryCreate(vault, UriKind.Absolute, out vaultUri))
        {
            return true;
        }

        vaultUri = null;
        return false;
    }
}
