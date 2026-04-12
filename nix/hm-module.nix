# Home Manager module for CoverPro
{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.programs.coverpro;
in {
  options.programs.coverpro = {
    enable = mkEnableOption "CoverPro - JD package runner";

    package = mkOption {
      type = types.package;
      default = pkgs.coverpro;
      defaultText = literalExpression "pkgs.coverpro";
      description = "The CoverPro package to use.";
    };

    # Development shell option (for dev work, not installed app)
    enableDevShell = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Add CoverPro development dependencies to your environment.
        Use this if you want to develop CoverPro, not just run it.
      '';
    };
  };

  config = mkIf cfg.enable {
    home.packages = [ cfg.package ];

    # XDG desktop integration
    xdg.desktopEntries.coverpro = {
      name = "CoverPro";
      comment = "Resume/Cover Letter Package Generator";
      exec = "${cfg.package}/bin/coverpro";
      terminal = false;
      categories = [ "Office" "Utility" ];
    };
  };
}
