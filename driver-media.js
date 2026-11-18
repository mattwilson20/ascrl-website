function getDriverImage(driverName) {
        const nameLower = (driverName || "").toLowerCase().replace(/^#\d+\s*/, '');
        if (nameLower.includes('mr. rogers') || nameLower.includes('mr rogers')) return 'https://raw.githubusercontent.com/mattwilson20/ascrl-website/6686ee35c988cd1b0ae305d099ff4e31c652a49f/mattwilson20_Hero_Card.jpg';
        
            if (nameLower.includes('riddle')) return "https://github.com/mattwilson20/ascrl-website/blob/main/RIDDLES_RENO.png?raw=true";
            if (nameLower.includes('superace')) return "https://github.com/mattwilson20/ascrl-website/blob/main/superace.png?raw=true";
            if (nameLower.includes('maddietheracer')) return "https://github.com/mattwilson20/ascrl-website/blob/main/Maddietheracer99.png?raw=true";
            if (nameLower.includes('theplugryan')) return "https://github.com/mattwilson20/ascrl-website/blob/main/Theplugryan.png?raw=true";
            if (nameLower.includes('thirsttraptoby')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/7bc95544293252379df0a7693e5770b80e8ca8bf/ThirstTrapTobyHeroCard.jpg";
            if (nameLower.includes('hockey')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/8e6c91687a3fd67cc8d9771eec28321a154a56ce/UpdatedHockeyHero.jpg";
            if (nameLower.includes('k7_dalton')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/9a7e63f44a37cedfdf0b85ddeb4968c3b0da8817/k7Dalton.jpg";
            if (nameLower.includes('isaac')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/d0f7c7e6480bc33317d4e7939036024f0dcff3dc/Isaac.jpg";
            if (nameLower.includes('z71chevyman')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/869f4adefde19421e449f2e1e9ab7bd3a6ffaee5/ChevyMan.jpg";
            if (nameLower.includes('a54buick')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/b0f5738c17ce63c442afaca0ad22da6998499e1b/BuickBandit.jpg";
            if (nameLower.includes('rickyspanish')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/a4eb1f155988eef725e62b9c29859db41c08a225/RickySpanish.jpg";
            if (nameLower.includes('solid1915')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/7655f9eefe0cdd0d1809954233309718780d8925/SolidOne.jpg";
            if (nameLower.includes('the_fireman')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/6426c5de3657027051e18be3fae01a1c56faefbd/Fireman.jpg";
            if (nameLower.includes('the_stone')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/e81190c6bca706ca129f3413df56c7f2e375f74b/Stone.jpg";
            if (nameLower.includes('alessi')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/050733b62b774aa4ec749a9612ba761aefcda477/updatedalessihero.jpg";
            if (nameLower.includes('dakotathomas')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/720d39d80f598430f8f4d7aa2a03360db2627230/IMG_7125.jpg";
            if (nameLower.includes('orangeman')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/70b5243e68e9c7f7a596f6695677d8d3520e89e1/IMG_7160.jpg";
            if (nameLower.includes('ant_was_he')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/050733b62b774aa4ec749a9612ba761aefcda477/updatedantwashehero.jpg";
            if (nameLower.includes('c0mpl1c8')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/099805ff88fcc2ba2a1cc2e8b5aba8f515a716a6/C0mpl1c8ted_hero_card.jpg";
            if (nameLower.includes('on-a-mission')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/446d56688b6fdf55420d2c5e52b6a764e873fab6/Mission_Hero_card.jpg";
            if (nameLower.includes('banishedcrayon')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/d42bcd32df90441f1b5f24da75a77074ea2186fe/Banished_Crayon_hero_Card.jpg";
            if (nameLower.includes('sithwarrior')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/3e992547a13fe5d73940648e83df80d97df41f90/SithWarriorUno_Hero_Card.jpg";
            if (nameLower.includes('majorblaz')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/77807b78b078188862cb490d2b95d2f846d237bf/Blaze_Hero_Card.jpg";
            if (nameLower.includes('thereaperrhino')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/050733b62b774aa4ec749a9612ba761aefcda477/updatedrhinohero.jpg";
            if (nameLower.includes('dalton')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/ec988478a8132f49d9d6b596e7ed258e2c2dd482/DaltonGregson_Hero_Card.jpg";
            if (nameLower.includes('singular_nacho')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/f311b21127533ca6128a4408f36edaf9612d59b1/Singular_Nacho_Hero_Card.jpg";
            if (nameLower.includes('mattwilson20')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/6686ee35c988cd1b0ae305d099ff4e31c652a49f/mattwilson20_Hero_Card.jpg";
            if (nameLower.includes('hockeydeckout')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/81df81de5161ea2f590ee32c370d3e99675cdbaa/Hockey_Hero_Card.png";
            if (nameLower.includes('dewshine')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/69fbabfd1608e3705ac8de05efb77f5c59d2a45a/IMG_8325.jpg";
            if (nameLower.includes('lnfvmous')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/4bee6a922312f5277f04304bbbe31876492949eb/InfamousUpdatedHero.jpg";
            if (nameLower.includes('fordemgators')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/050733b62b774aa4ec749a9612ba761aefcda477/updatedfordhero.jpg";
            if (nameLower.includes('gibson')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/a0de7269483b7e2ec5e1aaae549f739229008914/DGibby.hero.card.jpg";
            if (nameLower.includes('kingg')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/9eb12bdb1b61a806ad951ae9a8bddc590622f35f/King.Hero.Card.jpg";
            if (nameLower.includes('hatter')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/34425dadb737bc4bc27aa9271be62909dc9a3e99/Hatter.Hero.Card.jpg";
            if (nameLower.includes('big_fella')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/ced27a5d96e0d211f038b36e34a55bccf4a7e4de/BigFella.Hero.Card.jpg";
            if (nameLower.includes('titan')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/ee73828ab501e649ce3839648fc2f2eec0f98580/TitanHeroPic.jpg";
            if (nameLower.includes('lostcoz')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/19fc0a667f0ec6e94bea222fd593c938a2fff2e9/LostCozHeroCard.jpg";
            if (nameLower.includes('hambone')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/f59434c6e9122c0214a321e21888c2aacba368d0/HamboneHero.jpg";
            if (nameLower.includes('mike')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/f59434c6e9122c0214a321e21888c2aacba368d0/Mikehero.jpg";
            if (nameLower.includes('scott')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/f59434c6e9122c0214a321e21888c2aacba368d0/Scotthero.jpg";
            if (nameLower.includes('tophert')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/f59434c6e9122c0214a321e21888c2aacba368d0/topherthero.jpg";
            if (nameLower.includes('ty50')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/f59434c6e9122c0214a321e21888c2aacba368d0/ty50bmg.jpg";
            if (nameLower.includes('xx8lracing')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/f59434c6e9122c0214a321e21888c2aacba368d0/x8lracinghero.jpg";
            if (nameLower.includes('tampaxx')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/10c77e5291d5698e8a32204e81037b030e42d159/Tampaxxhero.jpg";
            if (nameLower.includes('bigray')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/8961bbf00688e8efae3e75af9b11ee473c6a5b0a/BigRayhero.jpg";
            if (nameLower.includes('wezzy')) return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/050733b62b774aa4ec749a9612ba761aefcda477/dezzyhero.jpg";
            if (nameLower.includes('nitro')) return "https://github.com/mattwilson20/ascrl-website/blob/main/NitroLosiUtah2.png?raw=true";
        
        return "https://raw.githubusercontent.com/mattwilson20/ascrl-website/ad657026d44e8f66292dddbee7b21b0568631461/1766598509726.jpg";
    }

window.ASCRL_DRIVER_IMAGE = getDriverImage;
