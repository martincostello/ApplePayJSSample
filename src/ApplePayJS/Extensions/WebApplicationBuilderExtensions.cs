// Copyright (c) Just Eat, 2016. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

namespace JustEat.ApplePayJS;

using System;
using System.Diagnostics.CodeAnalysis;
using Azure.Core;
using Azure.Identity;
using Microsoft.Extensions.Configuration;

internal static class WebApplicationBuilderExtensions
{
    public static WebApplicationBuilder TryConfigureAzureKeyVault(this WebApplicationBuilder builder)
    {
        if (TryGetVaultUri(builder.Configuration, out Uri? vaultUri))
        {
            TokenCredential credential = CreateCredential(builder.Configuration);
            builder.Configuration.AddAzureKeyVault(vaultUri, credential);
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

    private static TokenCredential CreateCredential(IConfiguration configuration)
    {
        string? clientId = configuration["AzureKeyVault:ClientId"];
        string? clientSecret = configuration["AzureKeyVault:ClientSecret"];
        string? tenantId = configuration["AzureKeyVault:TenantId"];

        if (!string.IsNullOrEmpty(clientId) &&
            !string.IsNullOrEmpty(clientSecret) &&
            !string.IsNullOrEmpty(tenantId))
        {
            // Use explicitly configured Azure Key Vault credentials
            return new ClientSecretCredential(tenantId, clientId, clientSecret);
        }
        else
        {
            // Assume Managed Service Identity is configured and available
            return new ManagedIdentityCredential();
        }
    }
}
