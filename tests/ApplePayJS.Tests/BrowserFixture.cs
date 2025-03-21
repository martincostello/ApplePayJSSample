// Copyright (c) Just Eat, 2016. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

using System.Globalization;
using System.Runtime.CompilerServices;
using Microsoft.Playwright;
using Xunit;

namespace ApplePayJS.Tests;

internal sealed class BrowserFixture(ITestOutputHelper? outputHelper)
{
    private static bool IsRunningInGitHubActions { get; } = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GITHUB_ACTIONS"));

    public async Task WithPageAsync(
        Func<IPage, Task> action,
        string browserType = "chromium",
        [CallerMemberName] string? testName = null)
    {
        using IPlaywright playwright = await Playwright.CreateAsync();

        await using IBrowser browser = await CreateBrowserAsync(playwright, browserType);

        BrowserNewPageOptions options = CreatePageOptions();

        IPage page = await browser.NewPageAsync(options);

        page.Console += (_, e) => outputHelper?.WriteLine(e.Text);
        page.PageError += (_, e) => outputHelper?.WriteLine(e);

        try
        {
            await action(page);
        }
        catch (Exception)
        {
            await TryCaptureScreenshotAsync(page, testName!, browserType);
            throw;
        }
        finally
        {
            await TryCaptureVideoAsync(page, testName!, browserType);
        }
    }

    private static BrowserNewPageOptions CreatePageOptions()
    {
        var options = new BrowserNewPageOptions()
        {
            IgnoreHTTPSErrors = true,
            Locale = "en-GB",
            TimezoneId = "Europe/London",
        };

        if (IsRunningInGitHubActions)
        {
            options.RecordVideoDir = "videos";
        }

        return options;
    }

    private static async Task<IBrowser> CreateBrowserAsync(IPlaywright playwright, string browserType)
    {
        var options = new BrowserTypeLaunchOptions();

        if (System.Diagnostics.Debugger.IsAttached)
        {
#pragma warning disable CS0612
            options.Devtools = true;
#pragma warning restore CS0612
            options.Headless = false;
            options.SlowMo = 100;
        }

        string[] split = browserType.Split(':');

        browserType = split[0];

        if (split.Length > 1)
        {
            options.Channel = split[1];
        }

        return await playwright[browserType].LaunchAsync(options);
    }

    private static string GenerateFileName(string testName, string browserType, string extension)
    {
        string os =
            OperatingSystem.IsLinux() ? "linux" :
            OperatingSystem.IsMacOS() ? "macos" :
            OperatingSystem.IsWindows() ? "windows" :
            "other";

        browserType = browserType.Replace(':', '_');

        string utcNow = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd-HH-mm-ss", CultureInfo.InvariantCulture);
        return $"{testName}_{browserType}_{os}_{utcNow}{extension}";
    }

    private async Task TryCaptureScreenshotAsync(
        IPage page,
        string testName,
        string browserType)
    {
        try
        {
            string fileName = GenerateFileName(testName, browserType, ".png");
            string path = Path.Combine("screenshots", fileName);

            await page.ScreenshotAsync(new PageScreenshotOptions()
            {
                Path = path,
            });

            outputHelper?.WriteLine($"Screenshot saved to {path}.");
        }
        catch (Exception ex)
        {
            outputHelper?.WriteLine("Failed to capture screenshot: " + ex);
        }
    }

    private async Task TryCaptureVideoAsync(
        IPage page,
        string testName,
        string browserType)
    {
        if (!IsRunningInGitHubActions)
        {
            return;
        }

        try
        {
            await page.CloseAsync();

            string videoSource = await page.Video!.PathAsync();

            string? directory = Path.GetDirectoryName(videoSource);
            string? extension = Path.GetExtension(videoSource);

            string fileName = GenerateFileName(testName, browserType, extension!);

            string videoDestination = Path.Combine(directory!, fileName);

            File.Move(videoSource, videoDestination);

            outputHelper?.WriteLine($"Video saved to {videoDestination}.");
        }
        catch (Exception ex)
        {
            outputHelper?.WriteLine("Failed to capture video: " + ex);
        }
    }
}
